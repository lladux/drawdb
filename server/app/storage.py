import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS diagrams (
    diagram_id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    database TEXT NOT NULL DEFAULT 'generic',
    data TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    last_modified TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gists (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    public INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Every change to a gist stores a full snapshot of its files as JSON.
CREATE TABLE IF NOT EXISTS gist_revisions (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    gist_id TEXT NOT NULL REFERENCES gists (id) ON DELETE CASCADE,
    version TEXT NOT NULL UNIQUE,
    committed_at TEXT NOT NULL,
    files TEXT NOT NULL,
    additions INTEGER NOT NULL,
    deletions INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS gist_revisions_by_gist ON gist_revisions (gist_id, seq);
"""


def now() -> str:
    """Current UTC time in the ISO format GitHub uses, e.g. 2026-01-31T12:00:00Z."""
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


class Database:
    def __init__(self, path: str):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)

    @contextmanager
    def connect(self):
        """Yield a connection inside a transaction that commits on success."""
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            with conn:
                yield conn
        finally:
            conn.close()
