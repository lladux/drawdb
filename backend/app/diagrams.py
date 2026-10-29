import json
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .auth import request_tokens
from .storage import Database, now
from .workspaces import WorkspaceStore

router = APIRouter(prefix="/diagrams")

SUMMARY_COLUMNS = "diagram_id, workspace_id, name, database, last_modified, size_bytes"


class DiagramStore:
    """Diagrams live in workspaces; every operation first checks that the
    request's tokens give access to the diagram's workspace."""

    def __init__(self, db: Database, workspaces: WorkspaceStore):
        self.db = db
        self.workspaces = workspaces

    @staticmethod
    def _summary(row) -> dict:
        return {
            "diagramId": row["diagram_id"],
            "workspaceId": row["workspace_id"],
            "name": row["name"],
            "database": row["database"],
            "lastModified": row["last_modified"],
            "sizeBytes": row["size_bytes"],
        }

    def _row(self, conn, diagram_id: str, columns: str = "*"):
        return conn.execute(
            f"SELECT {columns} FROM diagrams WHERE diagram_id = ?", (diagram_id,)
        ).fetchone()

    def _accessible_row(self, conn, diagram_id: str, tokens: list[str]):
        row = self._row(conn, diagram_id)
        if row is not None:
            self.workspaces.require_access(conn, row["workspace_id"], tokens)
        return row

    def list_all(self, tokens: list[str]) -> list[dict]:
        """Diagrams in every workspace the tokens can open."""
        with self.db.connect() as conn:
            ids = self.workspaces.accessible_ids(conn, tokens)
            placeholders = ",".join("?" * len(ids))
            rows = conn.execute(
                f"SELECT {SUMMARY_COLUMNS} FROM diagrams"
                f" WHERE workspace_id IN ({placeholders}) ORDER BY last_modified DESC",
                ids,
            ).fetchall()
        return [self._summary(r) for r in rows]

    def get(self, diagram_id: str, tokens: list[str]) -> dict | None:
        with self.db.connect() as conn:
            row = self._accessible_row(conn, diagram_id, tokens)
        if row is None:
            return None
        return {**json.loads(row["data"]), "workspaceId": row["workspace_id"]}

    def _write(self, conn, diagram_id: str, workspace_id: str, payload: dict, created_at: str):
        timestamp = now()
        payload = {**payload, "diagramId": diagram_id, "lastModified": timestamp}
        payload.pop("workspaceId", None)
        data = json.dumps(payload)
        conn.execute(
            """
            INSERT INTO diagrams (diagram_id, workspace_id, name, database, data,
                                  size_bytes, created_at, last_modified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (diagram_id) DO UPDATE SET
                workspace_id = excluded.workspace_id,
                name = excluded.name,
                database = excluded.database,
                data = excluded.data,
                size_bytes = excluded.size_bytes,
                last_modified = excluded.last_modified
            """,
            (
                diagram_id,
                workspace_id,
                payload.get("name") or "",
                payload.get("database") or "generic",
                data,
                len(data.encode()),
                created_at,
                timestamp,
            ),
        )
        return self._summary(self._row(conn, diagram_id, SUMMARY_COLUMNS))

    def save(self, diagram_id: str, payload: dict, tokens: list[str]) -> dict:
        """Create or replace a diagram. A new diagram goes to the payload's
        `workspaceId`, or to the default workspace when that is missing or no
        longer exists (the client may remember a deleted one); an existing
        diagram stays where it is, use `update` to move it."""
        with self.db.connect() as conn:
            row = self._accessible_row(conn, diagram_id, tokens)
            if row is not None:
                workspace_id, created_at = row["workspace_id"], row["created_at"]
            else:
                workspace_id = payload.get("workspaceId")
                if not workspace_id or not self.workspaces.exists(conn, workspace_id):
                    workspace_id = self.workspaces.default_workspace_id(conn)
                self.workspaces.require_access(conn, workspace_id, tokens)
                created_at = now()
            return self._write(conn, diagram_id, workspace_id, payload, created_at)

    def update(
        self, diagram_id: str, tokens: list[str], name: str | None, workspace_id: str | None
    ) -> dict | None:
        """Rename and/or move a diagram to another workspace."""
        with self.db.connect() as conn:
            row = self._accessible_row(conn, diagram_id, tokens)
            if row is None:
                return None
            target = workspace_id or row["workspace_id"]
            if target != row["workspace_id"]:
                self.workspaces.require_access(conn, target, tokens)
            payload = json.loads(row["data"])
            if name is not None:
                payload["name"] = name
            return self._write(conn, diagram_id, target, payload, row["created_at"])

    def delete(self, diagram_id: str, tokens: list[str]) -> bool:
        with self.db.connect() as conn:
            if self._accessible_row(conn, diagram_id, tokens) is None:
                return False
            conn.execute("DELETE FROM diagrams WHERE diagram_id = ?", (diagram_id,))
        return True


class UpdateDiagramBody(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    workspaceId: str | None = None


def store(request: Request) -> DiagramStore:
    return request.app.state.diagrams


def not_found() -> JSONResponse:
    return JSONResponse(status_code=404, content={"success": False, "message": "Diagram not found"})


@router.get("")
def list_diagrams(request: Request):
    return {"success": True, "data": store(request).list_all(request_tokens(request))}


@router.get("/{diagram_id}")
def get_diagram(request: Request, diagram_id: str):
    diagram = store(request).get(diagram_id, request_tokens(request))
    if diagram is None:
        return not_found()
    return {"success": True, "data": diagram}


@router.put("/{diagram_id}")
def save_diagram(request: Request, diagram_id: str, payload: dict[str, Any]):
    return {
        "success": True,
        "data": store(request).save(diagram_id, payload, request_tokens(request)),
    }


@router.patch("/{diagram_id}")
def update_diagram(request: Request, diagram_id: str, body: UpdateDiagramBody):
    summary = store(request).update(
        diagram_id, request_tokens(request), body.name, body.workspaceId
    )
    if summary is None:
        return not_found()
    return {"success": True, "data": summary}


@router.delete("/{diagram_id}")
def delete_diagram(request: Request, diagram_id: str):
    if not store(request).delete(diagram_id, request_tokens(request)):
        return not_found()
    return {"success": True, "message": "Diagram deleted"}
