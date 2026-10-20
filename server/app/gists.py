import asyncio
import functools
import logging

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .github import GistService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gists")

# Fields of a GitHub gist response that expose the token owner or are not
# needed by the client.
PRIVATE_GIST_FIELDS = {
    "owner",
    "history",
    "forks",
    "user",
    "url",
    "forks_url",
    "commits_url",
    "git_pull_url",
    "git_push_url",
    "html_url",
    "comments_url",
}


class CreateGistBody(BaseModel):
    filename: str
    content: str
    description: str = ""
    public: bool = False


class UpdateGistBody(BaseModel):
    filename: str
    # The client omits content to remove the file from the gist.
    content: str | None = None


def error(status: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"success": False, "message": message})


def handle_github_errors(not_found_message: str = "Gist not found"):
    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            try:
                return await fn(*args, **kwargs)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    return error(404, not_found_message)
                logger.exception("GitHub request failed")
                return error(500, "Something went wrong")
            except httpx.HTTPError:
                logger.exception("GitHub request failed")
                return error(500, "Something went wrong")

        return wrapper

    return decorator


def service(request: Request) -> GistService:
    return request.app.state.gists


def clean_gist(data: dict) -> dict:
    rest = {k: v for k, v in data.items() if k not in PRIVATE_GIST_FIELDS}
    rest["files"] = {
        name: {k: v for k, v in file.items() if k != "raw_url"}
        for name, file in (rest.get("files") or {}).items()
    }
    return rest


def clean_commit(commit: dict) -> dict:
    return {k: v for k, v in commit.items() if k not in ("user", "url")}


@router.post("")
@router.post("/")
@handle_github_errors()
async def create(request: Request, body: CreateGistBody):
    data = await service(request).create_gist(
        {
            "description": body.description,
            "public": body.public,
            "files": {body.filename: {"content": body.content}},
        }
    )
    return {"success": True, "data": {"id": data["id"], "files": data["files"]}}


@router.get("/{gist_id}")
@handle_github_errors()
async def get(request: Request, gist_id: str):
    data = await service(request).get_gist(gist_id)
    return {"success": True, "data": clean_gist(data)}


@router.patch("/{gist_id}")
@handle_github_errors()
async def update(request: Request, gist_id: str, body: UpdateGistBody):
    file = {"content": body.content} if body.content is not None else None
    data = await service(request).update_gist(gist_id, {"files": {body.filename: file}})

    # A gist with no files left is useless, so it gets removed.
    deleted = False
    if not data.get("files"):
        await service(request).delete_gist(gist_id)
        deleted = True

    return {"deleted": deleted, "success": True, "message": "Gist updated"}


@router.delete("/{gist_id}")
@handle_github_errors()
async def delete(request: Request, gist_id: str):
    await service(request).delete_gist(gist_id)
    return {"success": True, "message": "Gist deleted"}


@router.get("/{gist_id}/commits")
@handle_github_errors()
async def get_commits(
    request: Request, gist_id: str, per_page: int | None = None, page: int | None = None
):
    data = await service(request).get_commits(gist_id, per_page, page)
    return {"success": True, "data": [clean_commit(c) for c in data]}


@router.get("/{gist_id}/file-versions/{file}")
@handle_github_errors()
async def get_revisions_for_file(
    request: Request, gist_id: str, file: str, cursor: str | None = None, limit: int = 10
):
    """List commits that changed `file`, newest first, paginated by commit sha."""
    gists = service(request)
    revisions: dict[str, dict] = {}

    async def get_revision(sha: str) -> dict:
        if sha not in revisions:
            revisions[sha] = await gists.get_commit(gist_id, sha)
        return revisions[sha]

    batch_size = max(limit * 2, 50)
    page = 1
    start_processing = cursor is None
    versions: list[dict] = []
    has_more = True

    while len(versions) < limit and has_more:
        batch = await gists.get_commits(gist_id, batch_size, page)
        if not batch:
            break

        for commit in batch:
            if len(versions) >= limit:
                break

            if not start_processing:
                if commit["version"] == cursor:
                    start_processing = True
                continue

            if not versions:
                revision = await get_revision(commit["version"])
                if file in revision["files"]:
                    versions.append(commit)
                continue

            try:
                last, current = await asyncio.gather(
                    get_revision(versions[-1]["version"]),
                    get_revision(commit["version"]),
                )
            except httpx.HTTPError:
                logger.exception("Error comparing versions")
                versions.append(commit)
                continue

            # Older commits predate the file, so there is nothing left to find.
            if file not in current["files"]:
                has_more = False
                break

            previous = last["files"].get(file)
            if previous is None or previous.get("content") != current["files"][file].get("content"):
                versions.append(commit)

        if len(batch) < batch_size:
            has_more = False
        else:
            page += 1

    next_cursor = versions[-1]["version"] if len(versions) == limit else None

    return {
        "success": True,
        "data": [clean_commit(v) for v in versions],
        "pagination": {
            "cursor": next_cursor,
            "hasMore": next_cursor is not None,
            "limit": limit,
            "count": len(versions),
        },
    }


@router.get("/{gist_id}/file/{file}/compare/{version_a}/{version_b}")
@handle_github_errors("Gist or file not found")
async def compare(request: Request, gist_id: str, file: str, version_a: str, version_b: str):
    gists = service(request)
    data_a = await gists.get_commit(gist_id, version_a)
    data_b = {"files": {}}
    if version_b != "null":
        data_b = await gists.get_commit(gist_id, version_b)

    def content(data: dict) -> str:
        return (data["files"].get(file) or {}).get("content") or ""

    return {"success": True, "data": {"contentA": content(data_a), "contentB": content(data_b)}}


# Declared last so that /{gist_id}/commits is matched first.
@router.get("/{gist_id}/{sha}")
@handle_github_errors()
async def get_revision(request: Request, gist_id: str, sha: str):
    data = await service(request).get_commit(gist_id, sha)
    return {"success": True, "data": clean_gist(data)}
