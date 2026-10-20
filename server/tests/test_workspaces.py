import sqlite3

from fastapi.testclient import TestClient

from app.main import create_app

DIAGRAM = {
    "name": "Shop",
    "database": "postgresql",
    "tables": [
        {
            "id": "t1",
            "name": "users",
            "x": 10,
            "y": 20,
            "color": "#175e7a",
            "comment": "not needed for previews",
            "fields": [{"id": "f1", "name": "id", "type": "INT", "primary": True}],
        }
    ],
    "areas": [{"id": "a1", "name": "Core", "x": 0, "y": 0, "width": 300, "height": 200}],
    "notes": [{"id": "n1", "title": "Todo", "content": "x" * 500, "x": 400, "y": 0}],
    "references": [],
}


def auth(*tokens):
    return {"X-Workspace-Tokens": ",".join(tokens)}


def create_workspace(client, name="Work", password=None):
    res = client.post("/workspaces", json={"name": name, "password": password})
    assert res.status_code == 200
    body = res.json()
    return body["data"]["id"], body["token"]


def default_workspace(client):
    return client.get("/workspaces").json()["data"][0]


def test_starts_with_an_open_default_workspace(client):
    workspaces = client.get("/workspaces").json()["data"]
    assert [(w["name"], w["protected"], w["unlocked"]) for w in workspaces] == [
        ("Personal", False, True)
    ]


def test_new_diagram_goes_to_requested_or_default_workspace(client):
    work_id, _ = create_workspace(client)
    client.put("/diagrams/d1", json={**DIAGRAM, "workspaceId": work_id})
    client.put("/diagrams/d2", json=DIAGRAM)

    assert client.get("/diagrams/d1").json()["data"]["workspaceId"] == work_id
    assert (
        client.get("/diagrams/d2").json()["data"]["workspaceId"] == default_workspace(client)["id"]
    )


def test_saving_existing_diagram_does_not_move_it(client):
    work_id, _ = create_workspace(client)
    client.put("/diagrams/d1", json=DIAGRAM)
    client.put("/diagrams/d1", json={**DIAGRAM, "workspaceId": work_id})
    assert client.get("/diagrams/d1").json()["data"]["workspaceId"] != work_id


def test_protected_workspace_needs_a_token(client):
    secret_id, token = create_workspace(client, "Secret", "hunter2")
    assert token
    assert client.put("/diagrams/d1", json={**DIAGRAM, "workspaceId": secret_id}).status_code == 401
    assert (
        client.put(
            "/diagrams/d1", json={**DIAGRAM, "workspaceId": secret_id}, headers=auth(token)
        ).status_code
        == 200
    )

    locked = client.get("/diagrams/d1")
    assert locked.status_code == 401
    assert locked.json() == {
        "success": False,
        "message": "Workspace locked",
        "workspaceId": secret_id,
    }
    assert client.delete("/diagrams/d1").status_code == 401
    assert client.get(f"/workspaces/{secret_id}/diagrams").status_code == 401
    assert client.get("/diagrams/d1", headers=auth(token)).status_code == 200


def test_list_hides_locked_contents(client):
    secret_id, token = create_workspace(client, "Secret", "pw")
    client.put("/diagrams/d1", json={**DIAGRAM, "workspaceId": secret_id}, headers=auth(token))

    assert client.get("/diagrams").json()["data"] == []
    listed = {w["id"]: w for w in client.get("/workspaces").json()["data"]}
    assert listed[secret_id]["unlocked"] is False
    assert listed[secret_id]["diagramCount"] is None

    assert [
        d["diagramId"] for d in client.get("/diagrams", headers=auth(token)).json()["data"]
    ] == ["d1"]
    listed = {w["id"]: w for w in client.get("/workspaces", headers=auth(token)).json()["data"]}
    assert listed[secret_id]["diagramCount"] == 1


def test_unlock(client):
    secret_id, _ = create_workspace(client, "Secret", "pw")
    wrong = client.post(f"/workspaces/{secret_id}/unlock", json={"password": "nope"})
    assert wrong.status_code == 401
    assert wrong.json()["message"] == "Wrong password"

    token = client.post(f"/workspaces/{secret_id}/unlock", json={"password": "pw"}).json()["token"]
    assert client.get(f"/workspaces/{secret_id}/diagrams", headers=auth(token)).status_code == 200


def test_token_is_bound_to_its_workspace(client):
    a_id, a_token = create_workspace(client, "A", "pw")
    b_id, _ = create_workspace(client, "B", "pw")
    assert client.get(f"/workspaces/{b_id}/diagrams", headers=auth(a_token)).status_code == 401
    assert (
        client.get(f"/workspaces/{a_id}/diagrams", headers=auth("garbage", a_token)).status_code
        == 200
    )


def test_changing_password_revokes_old_tokens(client):
    secret_id, old = create_workspace(client, "Secret", "one")
    res = client.patch(f"/workspaces/{secret_id}", json={"password": "two"}, headers=auth(old))
    new = res.json()["token"]
    assert client.get(f"/workspaces/{secret_id}/diagrams", headers=auth(old)).status_code == 401
    assert client.get(f"/workspaces/{secret_id}/diagrams", headers=auth(new)).status_code == 200


def test_removing_password_opens_workspace(client):
    secret_id, token = create_workspace(client, "Secret", "pw")
    res = client.patch(f"/workspaces/{secret_id}", json={"password": ""}, headers=auth(token))
    assert res.json()["data"]["protected"] is False
    assert client.get(f"/workspaces/{secret_id}/diagrams").status_code == 200


def test_rename_workspace_needs_access(client):
    secret_id, token = create_workspace(client, "Secret", "pw")
    assert client.patch(f"/workspaces/{secret_id}", json={"name": "X"}).status_code == 401
    res = client.patch(f"/workspaces/{secret_id}", json={"name": "Renamed"}, headers=auth(token))
    assert res.json()["data"]["name"] == "Renamed"


def test_delete_workspace_deletes_its_diagrams(client):
    work_id, _ = create_workspace(client)
    client.put("/diagrams/d1", json={**DIAGRAM, "workspaceId": work_id})
    assert client.delete(f"/workspaces/{work_id}").status_code == 200
    assert client.get("/diagrams/d1").status_code == 404
    assert client.get(f"/workspaces/{work_id}/diagrams").status_code == 404


def test_rename_and_move_diagram(client):
    work_id, _ = create_workspace(client)
    secret_id, token = create_workspace(client, "Secret", "pw")
    client.put("/diagrams/d1", json=DIAGRAM)

    res = client.patch("/diagrams/d1", json={"name": "Renamed", "workspaceId": work_id})
    assert res.json()["data"] == {**res.json()["data"], "name": "Renamed", "workspaceId": work_id}
    assert client.get("/diagrams/d1").json()["data"]["name"] == "Renamed"

    assert client.patch("/diagrams/d1", json={"workspaceId": secret_id}).status_code == 401
    moved = client.patch("/diagrams/d1", json={"workspaceId": secret_id}, headers=auth(token))
    assert moved.json()["data"]["workspaceId"] == secret_id


def test_workspace_diagrams_include_trimmed_previews(client):
    workspace_id = default_workspace(client)["id"]
    client.put("/diagrams/d1", json=DIAGRAM)
    [item] = client.get(f"/workspaces/{workspace_id}/diagrams").json()["data"]
    preview = item["preview"]
    assert preview["tables"][0]["fields"] == [{"name": "id", "type": "INT"}]
    assert "comment" not in preview["tables"][0]
    assert preview["areas"][0]["name"] == "Core"
    assert len(preview["notes"][0]["content"]) == 200


def test_existing_database_is_migrated_into_default_workspace(settings):
    # Shape of the diagrams table before workspaces existed.
    conn = sqlite3.connect(settings.database_path)
    conn.execute(
        "CREATE TABLE diagrams (diagram_id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',"
        " database TEXT NOT NULL DEFAULT 'generic', data TEXT NOT NULL,"
        " size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL, last_modified TEXT NOT NULL)"
    )
    conn.execute(
        "INSERT INTO diagrams VALUES ('old', 'Old', 'sqlite', '{\"name\": \"Old\"}', 16, 't', 't')"
    )
    conn.commit()
    conn.close()

    with TestClient(create_app(settings)) as client:
        workspace = default_workspace(client)
        assert workspace["diagramCount"] == 1
        assert client.get("/diagrams/old").json()["data"]["workspaceId"] == workspace["id"]


def test_tokens_survive_restart(settings):
    with TestClient(create_app(settings)) as client:
        secret_id, token = create_workspace(client, "Secret", "pw")
    with TestClient(create_app(settings)) as client:
        assert (
            client.get(f"/workspaces/{secret_id}/diagrams", headers=auth(token)).status_code == 200
        )
