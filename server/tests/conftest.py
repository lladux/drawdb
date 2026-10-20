import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path):
    return Settings(
        database_path=str(tmp_path / "test.sqlite3"),
        mail_username="me@example.com",
        mail_host="smtp.example.com",
    )


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c
