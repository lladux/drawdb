def create(client, filename="share.json", content="{}"):
    res = client.post("/gists", json={"filename": filename, "content": content, "public": False})
    assert res.status_code == 200
    return res.json()["data"]["id"]


def patch(client, gist_id, filename, content=None):
    body = {"filename": filename}
    if content is not None:
        body["content"] = content
    return client.patch(f"/gists/{gist_id}", json=body)


def versions_of(client, gist_id, file, **params):
    return client.get(f"/gists/{gist_id}/file-versions/{file}", params=params).json()


def test_create_and_get(client):
    gist_id = create(client, content='{"a":1}')
    data = client.get(f"/gists/{gist_id}").json()["data"]
    assert data["id"] == gist_id
    assert data["files"]["share.json"]["content"] == '{"a":1}'
    assert data["files"]["share.json"]["filename"] == "share.json"


def test_missing_gist_is_404(client):
    res = client.get("/gists/nope")
    assert res.status_code == 404
    assert res.json() == {"success": False, "message": "Gist not found"}
    assert patch(client, "nope", "f", "x").status_code == 404
    assert client.delete("/gists/nope").status_code == 404
    assert client.get("/gists/nope/commits").status_code == 404


def test_update_adds_files_and_revisions(client):
    gist_id = create(client)
    patch(client, gist_id, "versionned.json", "v1")
    files = client.get(f"/gists/{gist_id}").json()["data"]["files"]
    assert set(files) == {"share.json", "versionned.json"}
    assert len(client.get(f"/gists/{gist_id}/commits").json()["data"]) == 2


def test_unchanged_update_creates_no_revision(client):
    gist_id = create(client, content="same")
    patch(client, gist_id, "share.json", "same")
    assert len(client.get(f"/gists/{gist_id}/commits").json()["data"]) == 1


def test_removing_last_file_deletes_gist(client):
    gist_id = create(client)
    res = patch(client, gist_id, "share.json")
    assert res.json()["deleted"] is True
    assert client.get(f"/gists/{gist_id}").status_code == 404


def test_removing_one_file_keeps_gist(client):
    gist_id = create(client)
    patch(client, gist_id, "versionned.json", "v1")
    res = patch(client, gist_id, "share.json")
    assert res.json()["deleted"] is False
    files = client.get(f"/gists/{gist_id}").json()["data"]["files"]
    assert set(files) == {"versionned.json"}


def test_commits_are_newest_first_and_paginated(client):
    gist_id = create(client, content="1")
    patch(client, gist_id, "share.json", "1\n2")
    commits = client.get(f"/gists/{gist_id}/commits").json()["data"]
    assert commits[0]["change_status"] == {"total": 1, "additions": 1, "deletions": 0}
    assert len(commits[0]["version"]) == 40

    page2 = client.get(f"/gists/{gist_id}/commits", params={"per_page": 1, "page": 2}).json()
    assert [c["version"] for c in page2["data"]] == [commits[1]["version"]]


def test_get_revision(client):
    gist_id = create(client, content="old")
    first = client.get(f"/gists/{gist_id}/commits").json()["data"][0]["version"]
    patch(client, gist_id, "share.json", "new")
    data = client.get(f"/gists/{gist_id}/{first}").json()["data"]
    assert data["files"]["share.json"]["content"] == "old"
    assert client.get(f"/gists/{gist_id}/{'0' * 40}").status_code == 404


def test_file_versions_skip_unchanged_and_stop_before_file_existed(client):
    gist_id = create(client, filename="other", content="x")
    for content in ["1", "2", "2", "3"]:
        patch(client, gist_id, "v.json", content)
    patch(client, gist_id, "other", "y")  # touches only the other file

    commits = [c["version"] for c in client.get(f"/gists/{gist_id}/commits").json()["data"]]
    # Newest first: other=y, v=3, v=2, v=1, other=x (the repeated "2" made no
    # commit). v=3 is listed once, at the newest commit that has it.
    body = versions_of(client, gist_id, "v.json")
    assert [v["version"] for v in body["data"]] == [commits[0], commits[2], commits[3]]
    assert body["pagination"] == {"cursor": None, "hasMore": False, "limit": 10, "count": 3}
    assert "files" not in body["data"][0]


def test_file_versions_paginate_with_cursor(client):
    gist_id = create(client, filename="v", content="1")
    patch(client, gist_id, "v", "2")
    patch(client, gist_id, "v", "3")
    commits = [c["version"] for c in client.get(f"/gists/{gist_id}/commits").json()["data"]]

    first = versions_of(client, gist_id, "v", limit=2)
    assert [v["version"] for v in first["data"]] == commits[:2]
    assert first["pagination"]["cursor"] == commits[1]

    second = versions_of(client, gist_id, "v", limit=2, cursor=commits[1])
    assert [v["version"] for v in second["data"]] == commits[2:]
    assert second["pagination"]["hasMore"] is False


def test_compare(client):
    gist_id = create(client, filename="v", content="1")
    patch(client, gist_id, "v", "2")
    new, old = [c["version"] for c in client.get(f"/gists/{gist_id}/commits").json()["data"]]

    data = client.get(f"/gists/{gist_id}/file/v/compare/{new}/{old}").json()["data"]
    assert data == {"contentA": "2", "contentB": "1"}
    data = client.get(f"/gists/{gist_id}/file/v/compare/{old}/null").json()["data"]
    assert data == {"contentA": "1", "contentB": ""}


def test_compare_missing_gist(client):
    res = client.get("/gists/nope/file/v/compare/a/b")
    assert res.status_code == 404
    assert res.json()["message"] == "Gist or file not found"
