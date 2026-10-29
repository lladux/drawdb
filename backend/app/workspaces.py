import json
import secrets
from typing import Annotated

from fastapi import APIRouter, Request
from pydantic import BaseModel, StringConstraints

from .auth import AccessPolicy, PasswordsDisabled, WrongPassword, request_tokens
from .storage import Database, now

router = APIRouter(prefix="/workspaces")

DEFAULT_WORKSPACE_NAME = "Personal"
PREVIEW_NOTE_CHARS = 200


class WorkspaceNotFound(Exception):
    pass


class WorkspaceLocked(Exception):
    def __init__(self, workspace_id: str):
        super().__init__(workspace_id)
        self.workspace_id = workspace_id


def preview_of(data: dict) -> dict:
    """The parts of a diagram the hub needs to draw its thumbnail."""
    return {
        "tables": [
            {
                "id": t.get("id"),
                "name": t.get("name", ""),
                "x": t.get("x", 0),
                "y": t.get("y", 0),
                "width": t.get("width"),
                "color": t.get("color"),
                "fields": [
                    {"name": f.get("name", ""), "type": f.get("type", "")}
                    for f in t.get("fields", [])
                ],
            }
            for t in data.get("tables") or []
        ],
        "areas": [
            {k: a.get(k) for k in ("id", "name", "x", "y", "width", "height", "color")}
            for a in data.get("areas") or []
        ],
        "notes": [
            {
                **{k: n.get(k) for k in ("id", "title", "x", "y", "width", "height", "color")},
                "content": (n.get("content") or "")[:PREVIEW_NOTE_CHARS],
            }
            for n in data.get("notes") or []
        ],
    }


class WorkspaceStore:
    def __init__(self, db: Database, auth: AccessPolicy):
        self.db = db
        self.auth = auth
        with db.connect() as conn:
            default_id = self.default_workspace_id(conn)
            conn.execute(
                "UPDATE diagrams SET workspace_id = ? WHERE workspace_id IS NULL", (default_id,)
            )

    def default_workspace_id(self, conn) -> str:
        """The oldest workspace, created if there are none."""
        row = conn.execute(
            "SELECT id FROM workspaces ORDER BY created_at, rowid LIMIT 1"
        ).fetchone()
        if row:
            return row["id"]
        return self._insert(conn, DEFAULT_WORKSPACE_NAME, None)

    def protected_count(self) -> int:
        """Workspaces that have a password, whether or not auth is enabled."""
        with self.db.connect() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM workspaces WHERE password_hash IS NOT NULL"
            ).fetchone()[0]

    def _insert(self, conn, name: str, password: str | None) -> str:
        workspace_id = secrets.token_hex(16)
        timestamp = now()
        conn.execute(
            "INSERT INTO workspaces (id, name, password_hash, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (
                workspace_id,
                name,
                self.auth.hash(password) if password else None,
                timestamp,
                timestamp,
            ),
        )
        return workspace_id

    def exists(self, conn, workspace_id: str) -> bool:
        return (
            conn.execute("SELECT 1 FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
            is not None
        )

    def row(self, conn, workspace_id: str):
        row = conn.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
        if row is None:
            raise WorkspaceNotFound(workspace_id)
        return row

    def can_access(self, row, tokens: list[str]) -> bool:
        return self.auth.can_access(row["id"], row["password_hash"], tokens)

    def require_access(self, conn, workspace_id: str, tokens: list[str]):
        row = self.row(conn, workspace_id)
        if not self.can_access(row, tokens):
            raise WorkspaceLocked(workspace_id)
        return row

    def accessible_ids(self, conn, tokens: list[str]) -> list[str]:
        rows = conn.execute("SELECT id, password_hash FROM workspaces").fetchall()
        return [r["id"] for r in rows if self.can_access(r, tokens)]

    def _json(self, conn, row, tokens: list[str]) -> dict:
        count = conn.execute(
            "SELECT COUNT(*) FROM diagrams WHERE workspace_id = ?", (row["id"],)
        ).fetchone()[0]
        unlocked = self.can_access(row, tokens)
        return {
            "id": row["id"],
            "name": row["name"],
            "protected": self.auth.is_protected(row["password_hash"]),
            "unlocked": unlocked,
            # Only reveal what a locked workspace holds once it is unlocked.
            "diagramCount": count if unlocked else None,
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def list_all(self, tokens: list[str]) -> list[dict]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM workspaces ORDER BY created_at, rowid").fetchall()
            return [self._json(conn, r, tokens) for r in rows]

    def create(self, name: str, password: str | None) -> tuple[dict, str | None]:
        with self.db.connect() as conn:
            workspace_id = self._insert(conn, name, password)
            row = self.row(conn, workspace_id)
            token = self.auth.issue(workspace_id, row["password_hash"]) if password else None
            return self._json(conn, row, [token] if token else []), token

    def update(
        self, workspace_id: str, tokens: list[str], name: str | None, password: str | None
    ) -> tuple[dict, str | None]:
        """Rename and/or change the password. An empty password removes it.
        Returns a fresh token when a new password is set, since it invalidates
        the old ones."""
        if password is not None and not self.auth.enabled:
            raise PasswordsDisabled()
        with self.db.connect() as conn:
            row = self.require_access(conn, workspace_id, tokens)
            password_hash = row["password_hash"]
            if password is not None:
                password_hash = self.auth.hash(password) if password else None
            conn.execute(
                "UPDATE workspaces SET name = ?, password_hash = ?, updated_at = ? WHERE id = ?",
                (name if name is not None else row["name"], password_hash, now(), workspace_id),
            )
            row = self.row(conn, workspace_id)
            token = self.auth.issue(workspace_id, password_hash) if password else None
            return self._json(conn, row, [*tokens, token] if token else tokens), token

    def delete(self, workspace_id: str, tokens: list[str]) -> None:
        with self.db.connect() as conn:
            self.require_access(conn, workspace_id, tokens)
            conn.execute("DELETE FROM workspaces WHERE id = ?", (workspace_id,))

    def unlock(self, workspace_id: str, password: str) -> str | None:
        """A token for the workspace, or None if it has no password. Raises
        WrongPassword."""
        with self.db.connect() as conn:
            row = self.row(conn, workspace_id)
        if row["password_hash"] is None:
            return None
        if not self.auth.check_password(password, row["password_hash"]):
            raise WrongPassword()
        return self.auth.issue(workspace_id, row["password_hash"])

    def diagrams(self, workspace_id: str, tokens: list[str]) -> list[dict]:
        with self.db.connect() as conn:
            self.require_access(conn, workspace_id, tokens)
            rows = conn.execute(
                "SELECT diagram_id, workspace_id, name, database, last_modified, size_bytes, data"
                " FROM diagrams WHERE workspace_id = ? ORDER BY last_modified DESC",
                (workspace_id,),
            ).fetchall()
        return [
            {
                "diagramId": r["diagram_id"],
                "workspaceId": r["workspace_id"],
                "name": r["name"],
                "database": r["database"],
                "lastModified": r["last_modified"],
                "sizeBytes": r["size_bytes"],
                "preview": preview_of(json.loads(r["data"])),
            }
            for r in rows
        ]


# Surrounding whitespace is dropped before the length check, so a name made
# only of spaces is rejected.
WorkspaceName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]


class CreateWorkspaceBody(BaseModel):
    name: WorkspaceName
    password: str | None = None


class UpdateWorkspaceBody(BaseModel):
    name: WorkspaceName | None = None
    # Omit to keep the password, "" to remove it.
    password: str | None = None


def store(request: Request) -> WorkspaceStore:
    return request.app.state.workspaces


@router.get("")
def list_workspaces(request: Request):
    return {"success": True, "data": store(request).list_all(request_tokens(request))}


@router.post("")
def create_workspace(request: Request, body: CreateWorkspaceBody):
    workspace, token = store(request).create(body.name, body.password or None)
    return {"success": True, "data": workspace, "token": token}


@router.patch("/{workspace_id}")
def update_workspace(request: Request, workspace_id: str, body: UpdateWorkspaceBody):
    workspace, token = store(request).update(
        workspace_id,
        request_tokens(request),
        body.name,
        body.password,
    )
    return {"success": True, "data": workspace, "token": token}


@router.delete("/{workspace_id}")
def delete_workspace(request: Request, workspace_id: str):
    store(request).delete(workspace_id, request_tokens(request))
    return {"success": True, "message": "Workspace deleted"}


@router.get("/{workspace_id}/diagrams")
def list_workspace_diagrams(request: Request, workspace_id: str):
    return {
        "success": True,
        "data": store(request).diagrams(workspace_id, request_tokens(request)),
    }
