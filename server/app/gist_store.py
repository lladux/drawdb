"""SQLite replacement for the GitHub Gists API that drawDB uses for sharing
and version history. Gists keep GitHub's shape (files, versions, commits) so
the frontend does not need to know where they are stored."""

import json
import mimetypes
import secrets
from difflib import SequenceMatcher

from .storage import Database, now


class GistNotFound(Exception):
    pass


def _file_entry(name: str, content: str) -> dict:
    return {
        "filename": name,
        "type": mimetypes.guess_type(name)[0] or "text/plain",
        "size": len(content.encode()),
        "truncated": False,
        "content": content,
    }


def _line_changes(old: dict[str, str], new: dict[str, str]) -> tuple[int, int]:
    additions = deletions = 0
    for name in old.keys() | new.keys():
        a = (old.get(name) or "").splitlines()
        b = (new.get(name) or "").splitlines()
        for tag, i1, i2, j1, j2 in SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
            if tag in ("replace", "delete"):
                deletions += i2 - i1
            if tag in ("replace", "insert"):
                additions += j2 - j1
    return additions, deletions


def _commit(row) -> dict:
    return {
        "version": row["version"],
        "committed_at": row["committed_at"],
        "change_status": {
            "total": row["additions"] + row["deletions"],
            "additions": row["additions"],
            "deletions": row["deletions"],
        },
    }


class GistStore:
    def __init__(self, db: Database):
        self.db = db

    def _gist_row(self, conn, gist_id: str):
        row = conn.execute("SELECT * FROM gists WHERE id = ?", (gist_id,)).fetchone()
        if row is None:
            raise GistNotFound(gist_id)
        return row

    def _latest_files(self, conn, gist_id: str) -> dict[str, str]:
        row = conn.execute(
            "SELECT files FROM gist_revisions WHERE gist_id = ? ORDER BY seq DESC LIMIT 1",
            (gist_id,),
        ).fetchone()
        return json.loads(row["files"]) if row else {}

    def _add_revision(self, conn, gist_id: str, old: dict, new: dict, timestamp: str):
        additions, deletions = _line_changes(old, new)
        conn.execute(
            "INSERT INTO gist_revisions"
            " (gist_id, version, committed_at, files, additions, deletions)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (gist_id, secrets.token_hex(20), timestamp, json.dumps(new), additions, deletions),
        )

    @staticmethod
    def _gist_json(row, files: dict[str, str]) -> dict:
        return {
            "id": row["id"],
            "description": row["description"],
            "public": bool(row["public"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "files": {name: _file_entry(name, content) for name, content in files.items()},
        }

    def create(self, description: str, public: bool, files: dict[str, str]) -> dict:
        gist_id = secrets.token_hex(16)
        timestamp = now()
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO gists (id, description, public, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (gist_id, description, int(public), timestamp, timestamp),
            )
            self._add_revision(conn, gist_id, {}, files, timestamp)
            return self._gist_json(self._gist_row(conn, gist_id), files)

    def get(self, gist_id: str, version: str | None = None) -> dict:
        with self.db.connect() as conn:
            row = self._gist_row(conn, gist_id)
            if version is None:
                files = self._latest_files(conn, gist_id)
            else:
                rev = conn.execute(
                    "SELECT files FROM gist_revisions WHERE gist_id = ? AND version = ?",
                    (gist_id, version),
                ).fetchone()
                if rev is None:
                    raise GistNotFound(f"{gist_id}@{version}")
                files = json.loads(rev["files"])
            return self._gist_json(row, files)

    def update(self, gist_id: str, changes: dict[str, str | None]) -> dict:
        """Apply file changes; a None value removes that file. Like GitHub, a
        change that leaves the files as they were creates no revision."""
        with self.db.connect() as conn:
            self._gist_row(conn, gist_id)
            old = self._latest_files(conn, gist_id)
            new = dict(old)
            for name, content in changes.items():
                if content is None:
                    new.pop(name, None)
                else:
                    new[name] = content
            if new != old:
                timestamp = now()
                self._add_revision(conn, gist_id, old, new, timestamp)
                conn.execute("UPDATE gists SET updated_at = ? WHERE id = ?", (timestamp, gist_id))
            return self._gist_json(self._gist_row(conn, gist_id), new)

    def delete(self, gist_id: str) -> None:
        with self.db.connect() as conn:
            if conn.execute("DELETE FROM gists WHERE id = ?", (gist_id,)).rowcount == 0:
                raise GistNotFound(gist_id)

    def commits(self, gist_id: str, per_page: int = 30, page: int = 1) -> list[dict]:
        with self.db.connect() as conn:
            self._gist_row(conn, gist_id)
            rows = conn.execute(
                "SELECT version, committed_at, additions, deletions FROM gist_revisions"
                " WHERE gist_id = ? ORDER BY seq DESC LIMIT ? OFFSET ?",
                (gist_id, per_page, (page - 1) * per_page),
            ).fetchall()
        return [_commit(r) for r in rows]

    def revisions(self, gist_id: str) -> list[dict]:
        """All revisions, newest first, as commits with their files added."""
        with self.db.connect() as conn:
            self._gist_row(conn, gist_id)
            rows = conn.execute(
                "SELECT * FROM gist_revisions WHERE gist_id = ? ORDER BY seq DESC", (gist_id,)
            ).fetchall()
        return [{**_commit(r), "files": json.loads(r["files"])} for r in rows]
