import dataclasses

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def preflight(client, origin):
    return client.options(
        "/workspaces",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-workspace-tokens",
        },
    )


@pytest.mark.parametrize(
    "origin", ["http://localhost:5173", "http://127.0.0.1:4173", "http://[::1]:5173"]
)
def test_local_origins_allowed_without_client_urls(client, origin):
    res = preflight(client, origin)
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize("origin", ["https://evil.example", "http://localhost.evil.example"])
def test_other_origins_rejected_without_client_urls(client, origin):
    assert preflight(client, origin).status_code == 400


def test_client_urls_replace_the_local_default(settings):
    settings = dataclasses.replace(settings, allowed_origins=["https://db.example.com"])
    with TestClient(create_app(settings)) as client:
        assert preflight(client, "https://db.example.com").status_code == 200
        assert preflight(client, "http://localhost:5173").status_code == 400
