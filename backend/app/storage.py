import secrets
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    -- NULL when the workspace has no password.
    password_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagrams (
    diagram_id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces (id) ON DELETE CASCADE,
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

SCHEMA_VERSION = 1


def now() -> str:
    """Current UTC time in the ISO format GitHub uses, e.g. 2026-01-31T12:00:00Z."""
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _migrate(conn: sqlite3.Connection) -> None:
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    if version < 1:
        # Databases created before workspaces existed lack the column.
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(diagrams)")}
        if "workspace_id" not in columns:
            conn.execute(
                "ALTER TABLE diagrams ADD COLUMN workspace_id TEXT"
                " REFERENCES workspaces (id) ON DELETE CASCADE"
            )
    conn.execute("CREATE INDEX IF NOT EXISTS diagrams_by_workspace ON diagrams (workspace_id)")
    conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")


class Database:
    def __init__(self, path: str):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)
            _migrate(conn)

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

    def secret(self) -> bytes:
        """A random key generated once per database, used to sign tokens."""
        with self.connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO meta (key, value) VALUES ('secret', ?)",
                (secrets.token_hex(32),),
            )
            row = conn.execute("SELECT value FROM meta WHERE key = 'secret'").fetchone()
        return bytes.fromhex(row["value"])
