from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from test_workspaces import DIAGRAM, create_workspace

from app.main import create_app


@pytest.fixture
def open_client(settings):
    with TestClient(create_app(replace(settings, auth_enabled=False))) as c:
        yield c


def test_config_reports_auth_off(open_client):
    assert open_client.get("/config").json()["data"] == {"auth": False}


def test_passwords_cannot_be_set(open_client):
    res = open_client.post("/workspaces", json={"name": "Work", "password": "secret"})
    assert res.status_code == 400

    work_id, _ = create_workspace(open_client)
    for password in ("secret", ""):
        res = open_client.patch(f"/workspaces/{work_id}", json={"password": password})
        assert res.status_code == 400


def test_unlock_route_is_absent(open_client):
    work_id, _ = create_workspace(open_client)
    res = open_client.post(f"/workspaces/{work_id}/unlock", json={"password": "x"})
    assert res.status_code in (404, 405)


def test_existing_protected_workspace_is_open_and_keeps_its_password(settings):
    with TestClient(create_app(settings)) as client:
        work_id, _ = create_workspace(client, password="secret")
        client.put(
            "/diagrams/d1",
            json={**DIAGRAM, "workspaceId": work_id},
            headers={
                "X-Workspace-Tokens": client.post(
                    f"/workspaces/{work_id}/unlock", json={"password": "secret"}
                ).json()["token"]
            },
        )

    with TestClient(create_app(replace(settings, auth_enabled=False))) as client:
        workspace = next(w for w in client.get("/workspaces").json()["data"] if w["id"] == work_id)
        assert workspace["protected"] is False
        assert workspace["unlocked"] is True
        assert client.get("/diagrams/d1").status_code == 200
        # Renaming works and must not drop the stored password.
        assert client.patch(f"/workspaces/{work_id}", json={"name": "Renamed"}).status_code == 200

    with TestClient(create_app(settings)) as client:
        assert client.get("/diagrams/d1").status_code == 401
        res = client.post(f"/workspaces/{work_id}/unlock", json={"password": "secret"})
        assert res.status_code == 200
