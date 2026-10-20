from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .gist_store import GistNotFound, GistStore

router = APIRouter(prefix="/gists")


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


def store(request: Request) -> GistStore:
    return request.app.state.gists


def commit_summary(revision: dict) -> dict:
    return {k: v for k, v in revision.items() if k != "files"}


@router.post("")
@router.post("/")
def create(request: Request, body: CreateGistBody):
    gist = store(request).create(body.description, body.public, {body.filename: body.content})
    return {"success": True, "data": {"id": gist["id"], "files": gist["files"]}}


@router.get("/{gist_id}")
def get(request: Request, gist_id: str):
    return {"success": True, "data": store(request).get(gist_id)}


@router.patch("/{gist_id}")
def update(request: Request, gist_id: str, body: UpdateGistBody):
    gist = store(request).update(gist_id, {body.filename: body.content})

    # A gist with no files left is useless, so it gets removed.
    deleted = False
    if not gist["files"]:
        store(request).delete(gist_id)
        deleted = True

    return {"deleted": deleted, "success": True, "message": "Gist updated"}


@router.delete("/{gist_id}")
def delete(request: Request, gist_id: str):
    store(request).delete(gist_id)
    return {"success": True, "message": "Gist deleted"}


@router.get("/{gist_id}/commits")
def get_commits(
    request: Request,
    gist_id: str,
    per_page: int = Query(30, ge=1, le=100),
    page: int = Query(1, ge=1),
):
    return {"success": True, "data": store(request).commits(gist_id, per_page, page)}


@router.get("/{gist_id}/file-versions/{file}")
def get_revisions_for_file(
    request: Request,
    gist_id: str,
    file: str,
    cursor: str | None = None,
    limit: int = Query(10, ge=1),
):
    """List commits that changed `file`, newest first, paginated by commit sha.

    Walking back from the newest commit, a commit is listed when its copy of
    the file differs from the last listed one."""
    revisions = store(request).revisions(gist_id)
    if cursor is not None:
        index = next((i for i, r in enumerate(revisions) if r["version"] == cursor), None)
        revisions = [] if index is None else revisions[index + 1 :]

    versions: list[dict] = []
    for revision in revisions:
        if len(versions) >= limit:
            break
        content = revision["files"].get(file)
        if not versions:
            if content is not None:
                versions.append(revision)
            continue
        # Older commits predate the file, so there is nothing left to find.
        if content is None:
            break
        if content != versions[-1]["files"][file]:
            versions.append(revision)

    next_cursor = versions[-1]["version"] if len(versions) == limit else None

    return {
        "success": True,
        "data": [commit_summary(v) for v in versions],
        "pagination": {
            "cursor": next_cursor,
            "hasMore": next_cursor is not None,
            "limit": limit,
            "count": len(versions),
        },
    }


@router.get("/{gist_id}/file/{file}/compare/{version_a}/{version_b}")
def compare(request: Request, gist_id: str, file: str, version_a: str, version_b: str):
    try:
        data_a = store(request).get(gist_id, version_a)
        data_b = {"files": {}}
        if version_b != "null":
            data_b = store(request).get(gist_id, version_b)
    except GistNotFound:
        return error(404, "Gist or file not found")

    def content(data: dict) -> str:
        return (data["files"].get(file) or {}).get("content") or ""

    return {"success": True, "data": {"contentA": content(data_a), "contentB": content(data_b)}}


# Declared last so that /{gist_id}/commits is matched first.
@router.get("/{gist_id}/{sha}")
def get_revision(request: Request, gist_id: str, sha: str):
    return {"success": True, "data": store(request).get(gist_id, sha)}
