import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from . import auth, diagrams, email_route, gists, workspaces
from .config import Settings, load_settings
from .gist_store import GistNotFound, GistStore
from .storage import Database

LOCAL_ORIGINS = r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?"

# Uvicorn's logger, so warnings show up formatted like the rest of the log.
logger = logging.getLogger("uvicorn.error")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    db = Database(settings.database_path)
    access = (
        auth.PasswordAuth(auth.TokenSigner(db.secret())) if settings.auth_enabled else auth.NoAuth()
    )
    workspace_store = workspaces.WorkspaceStore(db, access)
    if not settings.auth_enabled and workspace_store.protected_count():
        logger.warning(
            "AUTH_ENABLED is off: %d password-protected workspace(s) are open to anyone"
            " who can reach the server.",
            workspace_store.protected_count(),
        )

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

    @app.exception_handler(auth.PasswordsDisabled)
    async def passwords_disabled(request: Request, exc: auth.PasswordsDisabled):
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "Workspace passwords are disabled"},
        )

    @app.get("/", response_class=PlainTextResponse)
    async def root():
        return "Hello"

    app.include_router(diagrams.router)
    app.include_router(email_route.router)
    app.include_router(gists.router)
    app.include_router(workspaces.router)
    if settings.auth_enabled:
        app.include_router(auth.router)

    # Lets the frontend hide features the server has turned off.
    @app.get("/config")
    def config():
        return {"success": True, "data": {"auth": settings.auth_enabled}}

    return app
