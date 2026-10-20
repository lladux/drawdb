import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


class FakeGitHub:
    """In-memory stand-in for the GitHub Gists API."""

    def __init__(self):
        self.requests: list[httpx.Request] = []
        # Newest first, like GitHub. Each entry is (sha, {filename: content}).
        self.history: list[tuple[str, dict[str, str]]] = []

    def gist_body(self, files: dict[str, str]) -> dict:
        return {
            "id": "g1",
            "owner": {"login": "me"},
            "html_url": "https://gist.github.com/g1",
            "description": "drawDB diagram",
            "files": {
                name: {"filename": name, "content": content, "raw_url": "https://raw"}
                for name, content in files.items()
            },
        }

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        parts = request.url.path.removeprefix("/gists").strip("/").split("/")
        parts = [p for p in parts if p]

        if request.method == "POST" and not parts:
            body = json.loads(request.content)
            files = {k: v["content"] for k, v in body["files"].items()}
            return httpx.Response(201, json=self.gist_body(files))

        if parts and parts[0] != "g1":
            return httpx.Response(404, json={"message": "Not Found"})

        if request.method == "DELETE":
            return httpx.Response(204)

        if request.method == "PATCH":
            body = json.loads(request.content)
            files = dict(self.history[0][1]) if self.history else {}
            for name, file in body["files"].items():
                if file is None:
                    files.pop(name, None)
                else:
                    files[name] = file["content"]
            return httpx.Response(200, json=self.gist_body(files))

        if len(parts) == 1:
            return httpx.Response(200, json=self.gist_body(self.history[0][1]))

        if parts[1] == "commits":
            per_page = int(request.url.params.get("per_page", 30))
            page = int(request.url.params.get("page", 1))
            chunk = self.history[(page - 1) * per_page : page * per_page]
            return httpx.Response(
                200,
                json=[
                    {"version": sha, "user": {}, "url": "u", "committed_at": "t"}
                    for sha, _ in chunk
                ],
            )

        for sha, files in self.history:
            if sha == parts[1]:
                return httpx.Response(200, json=self.gist_body(files))
        return httpx.Response(404, json={"message": "Not Found"})


@pytest.fixture
def github():
    return FakeGitHub()


@pytest.fixture
def client(github):
    app = create_app(Settings(github_token="t"), httpx.MockTransport(github.handler))
    with TestClient(app) as c:
        yield c


def test_create_returns_id_and_sends_token(client, github):
    res = client.post("/gists", json={"filename": "share.json", "content": "{}", "public": False})
    assert res.status_code == 200
    assert res.json()["data"]["id"] == "g1"
    assert github.requests[0].headers["Authorization"] == "Bearer t"


def test_get_strips_private_fields(client, github):
    github.history = [("a", {"share.json": "{}"})]
    data = client.get("/gists/g1").json()["data"]
    assert "owner" not in data and "html_url" not in data
    assert "raw_url" not in data["files"]["share.json"]
    assert data["files"]["share.json"]["content"] == "{}"


def test_get_missing_gist_is_404(client):
    res = client.get("/gists/nope")
    assert res.status_code == 404
    assert res.json() == {"success": False, "message": "Gist not found"}


def test_update_without_content_removes_file_and_empty_gist(client, github):
    github.history = [("a", {"share.json": "{}"})]
    res = client.patch("/gists/g1", json={"filename": "share.json"})
    assert res.json()["deleted"] is True
    assert json.loads(github.requests[0].content) == {"files": {"share.json": None}}
    assert github.requests[1].method == "DELETE"


def test_update_with_content_keeps_gist(client, github):
    github.history = [("a", {"share.json": "{}"})]
    res = client.patch("/gists/g1", json={"filename": "share.json", "content": "[]"})
    assert res.json()["deleted"] is False
    assert len(github.requests) == 1


def test_commits_route_is_not_shadowed_by_revision_route(client, github):
    github.history = [("b", {"f": "2"}), ("a", {"f": "1"})]
    data = client.get("/gists/g1/commits", params={"per_page": 1, "page": 2}).json()["data"]
    assert data == [{"version": "a", "committed_at": "t"}]


def test_revision(client, github):
    github.history = [("b", {"f": "2"}), ("a", {"f": "1"})]
    data = client.get("/gists/g1/a").json()["data"]
    assert data["files"]["f"]["content"] == "1"


def test_file_versions_skips_unchanged_and_stops_before_file_existed(client, github):
    github.history = [
        ("e", {"v.json": "3"}),
        ("d", {"v.json": "2", "other": "x"}),
        ("c", {"v.json": "2"}),
        ("b", {"v.json": "1"}),
        ("a", {"other": "x"}),
    ]
    body = client.get("/gists/g1/file-versions/v.json").json()
    assert [v["version"] for v in body["data"]] == ["e", "d", "b"]
    assert body["pagination"] == {"cursor": None, "hasMore": False, "limit": 10, "count": 3}


def test_file_versions_paginates_with_cursor(client, github):
    github.history = [("c", {"v": "3"}), ("b", {"v": "2"}), ("a", {"v": "1"})]
    first = client.get("/gists/g1/file-versions/v", params={"limit": 2}).json()
    assert [v["version"] for v in first["data"]] == ["c", "b"]
    assert first["pagination"]["cursor"] == "b"

    second = client.get("/gists/g1/file-versions/v", params={"limit": 2, "cursor": "b"}).json()
    assert [v["version"] for v in second["data"]] == ["a"]
    assert second["pagination"]["hasMore"] is False


def test_compare_against_null_version(client, github):
    github.history = [("a", {"v": "1"})]
    data = client.get("/gists/g1/file/v/compare/a/null").json()["data"]
    assert data == {"contentA": "1", "contentB": ""}


def test_compare_missing_gist(client):
    res = client.get("/gists/nope/file/v/compare/a/b")
    assert res.status_code == 404
    assert res.json()["message"] == "Gist or file not found"
