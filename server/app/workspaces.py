import json
import secrets

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .auth import TokenSigner, hash_password, request_tokens, verify_password
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
    def __init__(self, db: Database, signer: TokenSigner):
        self.db = db
        self.signer = signer
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

    @staticmethod
    def _insert(conn, name: str, password: str | None) -> str:
        workspace_id = secrets.token_hex(16)
        timestamp = now()
        conn.execute(
            "INSERT INTO workspaces (id, name, password_hash, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (
                workspace_id,
                name,
                hash_password(password) if password else None,
                timestamp,
                timestamp,
            ),
        )
        return workspace_id

    def row(self, conn, workspace_id: str):
        row = conn.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
        if row is None:
            raise WorkspaceNotFound(workspace_id)
        return row

    def can_access(self, row, tokens: list[str]) -> bool:
        if row["password_hash"] is None:
            return True
        return any(self.signer.is_valid(t, row["id"], row["password_hash"]) for t in tokens)

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
            "protected": row["password_hash"] is not None,
            "unlocked": unlocked,
            # Only reveal what a locked workspace holds once it is unlocked.
            "diagramCount": count if unlocked else None,
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def list(self, tokens: list[str]) -> list[dict]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM workspaces ORDER BY created_at, rowid").fetchall()
            return [self._json(conn, r, tokens) for r in rows]

    def create(self, name: str, password: str | None) -> tuple[dict, str | None]:
        with self.db.connect() as conn:
            workspace_id = self._insert(conn, name, password)
            row = self.row(conn, workspace_id)
            token = self.signer.issue(workspace_id, row["password_hash"]) if password else None
            return self._json(conn, row, [token] if token else []), token

    def update(
        self, workspace_id: str, tokens: list[str], name: str | None, password: str | None
    ) -> tuple[dict, str | None]:
        """Rename and/or change the password. An empty password removes it.
        Returns a fresh token when a new password is set, since it invalidates
        the old ones."""
        with self.db.connect() as conn:
            row = self.require_access(conn, workspace_id, tokens)
            password_hash = row["password_hash"]
            if password is not None:
                password_hash = hash_password(password) if password else None
            conn.execute(
                "UPDATE workspaces SET name = ?, password_hash = ?, updated_at = ? WHERE id = ?",
                (name if name is not None else row["name"], password_hash, now(), workspace_id),
            )
            row = self.row(conn, workspace_id)
            token = self.signer.issue(workspace_id, password_hash) if password else None
            return self._json(conn, row, [*tokens, token] if token else tokens), token

    def delete(self, workspace_id: str, tokens: list[str]) -> None:
        with self.db.connect() as conn:
            self.require_access(conn, workspace_id, tokens)
            conn.execute("DELETE FROM workspaces WHERE id = ?", (workspace_id,))

    def unlock(self, workspace_id: str, password: str) -> str | None:
        with self.db.connect() as conn:
            row = self.row(conn, workspace_id)
        if row["password_hash"] is None:
            return None
        if not verify_password(password, row["password_hash"]):
            raise WorkspaceLocked(workspace_id)
        return self.signer.issue(workspace_id, row["password_hash"])

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


class CreateWorkspaceBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    password: str | None = None


class UpdateWorkspaceBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    # Omit to keep the password, "" to remove it.
    password: str | None = None


class UnlockBody(BaseModel):
    password: str


def store(request: Request) -> WorkspaceStore:
    return request.app.state.workspaces


@router.get("")
def list_workspaces(request: Request):
    return {"success": True, "data": store(request).list(request_tokens(request))}


@router.post("")
def create_workspace(request: Request, body: CreateWorkspaceBody):
    workspace, token = store(request).create(body.name.strip(), body.password or None)
    return {"success": True, "data": workspace, "token": token}


@router.patch("/{workspace_id}")
def update_workspace(request: Request, workspace_id: str, body: UpdateWorkspaceBody):
    workspace, token = store(request).update(
        workspace_id,
        request_tokens(request),
        body.name.strip() if body.name is not None else None,
        body.password,
    )
    return {"success": True, "data": workspace, "token": token}


@router.delete("/{workspace_id}")
def delete_workspace(request: Request, workspace_id: str):
    store(request).delete(workspace_id, request_tokens(request))
    return {"success": True, "message": "Workspace deleted"}


@router.post("/{workspace_id}/unlock")
def unlock_workspace(request: Request, workspace_id: str, body: UnlockBody):
    try:
        token = store(request).unlock(workspace_id, body.password)
    except WorkspaceLocked:
        return JSONResponse(
            status_code=401, content={"success": False, "message": "Wrong password"}
        )
    return {"success": True, "token": token}


@router.get("/{workspace_id}/diagrams")
def list_workspace_diagrams(request: Request, workspace_id: str):
    return {
        "success": True,
        "data": store(request).diagrams(workspace_id, request_tokens(request)),
    }
