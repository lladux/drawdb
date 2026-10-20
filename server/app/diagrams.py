import json
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .storage import Database, now

router = APIRouter(prefix="/diagrams")


class DiagramStore:
    def __init__(self, db: Database):
        self.db = db

    @staticmethod
    def _summary(row) -> dict:
        return {
            "diagramId": row["diagram_id"],
            "name": row["name"],
            "database": row["database"],
            "lastModified": row["last_modified"],
            "sizeBytes": row["size_bytes"],
        }

    def list(self) -> list[dict]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT diagram_id, name, database, last_modified, size_bytes"
                " FROM diagrams ORDER BY last_modified DESC"
            ).fetchall()
        return [self._summary(r) for r in rows]

    def get(self, diagram_id: str) -> dict | None:
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT data FROM diagrams WHERE diagram_id = ?", (diagram_id,)
            ).fetchone()
        return json.loads(row["data"]) if row else None

    def save(self, diagram_id: str, payload: dict) -> dict:
        timestamp = now()
        payload = {**payload, "diagramId": diagram_id, "lastModified": timestamp}
        data = json.dumps(payload)
        with self.db.connect() as conn:
            conn.execute(
                """
                INSERT INTO diagrams
                    (diagram_id, name, database, data, size_bytes, created_at, last_modified)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (diagram_id) DO UPDATE SET
                    name = excluded.name,
                    database = excluded.database,
                    data = excluded.data,
                    size_bytes = excluded.size_bytes,
                    last_modified = excluded.last_modified
                """,
                (
                    diagram_id,
                    payload.get("name") or "",
                    payload.get("database") or "generic",
                    data,
                    len(data.encode()),
                    timestamp,
                    timestamp,
                ),
            )
            row = conn.execute(
                "SELECT diagram_id, name, database, last_modified, size_bytes"
                " FROM diagrams WHERE diagram_id = ?",
                (diagram_id,),
            ).fetchone()
        return self._summary(row)

    def delete(self, diagram_id: str) -> bool:
        with self.db.connect() as conn:
            cur = conn.execute("DELETE FROM diagrams WHERE diagram_id = ?", (diagram_id,))
        return cur.rowcount > 0


def store(request: Request) -> DiagramStore:
    return request.app.state.diagrams


def not_found() -> JSONResponse:
    return JSONResponse(status_code=404, content={"success": False, "message": "Diagram not found"})


@router.get("")
def list_diagrams(request: Request):
    return {"success": True, "data": store(request).list()}


@router.get("/{diagram_id}")
def get_diagram(request: Request, diagram_id: str):
    diagram = store(request).get(diagram_id)
    if diagram is None:
        return not_found()
    return {"success": True, "data": diagram}


@router.put("/{diagram_id}")
def save_diagram(request: Request, diagram_id: str, payload: dict[str, Any]):
    return {"success": True, "data": store(request).save(diagram_id, payload)}


@router.delete("/{diagram_id}")
def delete_diagram(request: Request, diagram_id: str):
    if not store(request).delete(diagram_id):
        return not_found()
    return {"success": True, "message": "Diagram deleted"}
