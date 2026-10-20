from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from . import diagrams, email_route, gists, workspaces
from .auth import TokenSigner
from .config import Settings, load_settings
from .gist_store import GistNotFound, GistStore
from .storage import Database

LOCAL_ORIGINS = r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    db = Database(settings.database_path)
    workspace_store = workspaces.WorkspaceStore(db, TokenSigner(db.secret()))

    app = FastAPI(title="drawDB server")
    app.state.settings = settings
    app.state.workspaces = workspace_store
    app.state.diagrams = diagrams.DiagramStore(db, workspace_store)
    app.state.gists = GistStore(db)

    if settings.dev:
        origins = {"allow_origins": ["*"]}
    elif settings.allowed_origins:
        origins = {"allow_origins": settings.allowed_origins}
    else:
        # Without CLIENT_URLS, accept the frontend served from this machine.
        origins = {"allow_origin_regex": LOCAL_ORIGINS}
    app.add_middleware(CORSMiddleware, **origins, allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(GistNotFound)
    async def gist_not_found(request: Request, exc: GistNotFound):
        return JSONResponse(
            status_code=404, content={"success": False, "message": "Gist not found"}
        )

    @app.exception_handler(workspaces.WorkspaceNotFound)
    async def workspace_not_found(request: Request, exc: workspaces.WorkspaceNotFound):
        return JSONResponse(
            status_code=404, content={"success": False, "message": "Workspace not found"}
        )

    @app.exception_handler(workspaces.WorkspaceLocked)
    async def workspace_locked(request: Request, exc: workspaces.WorkspaceLocked):
        return JSONResponse(
            status_code=401,
            content={
                "success": False,
                "message": "Workspace locked",
                "workspaceId": exc.workspace_id,
            },
        )

    @app.get("/", response_class=PlainTextResponse)
    async def root():
        return "Hello"

    app.include_router(diagrams.router)
    app.include_router(email_route.router)
    app.include_router(gists.router)
    app.include_router(workspaces.router)

    return app
