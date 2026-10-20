from fastapi.testclient import TestClient

from app.main import create_app

DIAGRAM = {
    "name": "Shop",
    "database": "postgresql",
    "tables": [{"id": "t1", "name": "users", "fields": []}],
    "references": [],
    "pan": {"x": 0, "y": 0},
    "zoom": 1,
}


def test_save_and_load_round_trip(client):
    res = client.put("/diagrams/d1", json=DIAGRAM)
    assert res.status_code == 200
    summary = res.json()["data"]
    assert summary["diagramId"] == "d1"
    assert summary["name"] == "Shop"
    assert summary["sizeBytes"] > 0

    loaded = client.get("/diagrams/d1").json()["data"]
    assert loaded["tables"] == DIAGRAM["tables"]
    assert loaded["diagramId"] == "d1"
    assert loaded["lastModified"] == summary["lastModified"]


def test_path_id_wins_over_body_id(client):
    client.put("/diagrams/d1", json={**DIAGRAM, "diagramId": "other"})
    assert client.get("/diagrams/d1").json()["data"]["diagramId"] == "d1"
    assert client.get("/diagrams/other").status_code == 404


def test_save_again_updates_in_place(client):
    client.put("/diagrams/d1", json=DIAGRAM)
    client.put("/diagrams/d1", json={**DIAGRAM, "name": "Renamed"})
    items = client.get("/diagrams").json()["data"]
    assert [i["name"] for i in items] == ["Renamed"]


def test_list_has_summaries_only(client):
    client.put("/diagrams/d1", json=DIAGRAM)
    client.put("/diagrams/d2", json={**DIAGRAM, "name": "Blog", "database": "sqlite"})
    items = client.get("/diagrams").json()["data"]
    assert {i["diagramId"] for i in items} == {"d1", "d2"}
    assert all("tables" not in i for i in items)


def test_missing_diagram_is_404(client):
    assert client.get("/diagrams/nope").status_code == 404
    assert client.delete("/diagrams/nope").status_code == 404


def test_delete(client):
    client.put("/diagrams/d1", json=DIAGRAM)
    assert client.delete("/diagrams/d1").status_code == 200
    assert client.get("/diagrams/d1").status_code == 404


def test_body_must_be_an_object(client):
    assert client.put("/diagrams/d1", json=[1, 2]).status_code == 422


def test_data_survives_restart(settings):
    with TestClient(create_app(settings)) as c:
        c.put("/diagrams/d1", json=DIAGRAM)
    with TestClient(create_app(settings)) as c:
        assert c.get("/diagrams/d1").json()["data"]["name"] == "Shop"
