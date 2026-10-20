from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from . import diagrams, email_route, gists
from .config import Settings, load_settings
from .gist_store import GistNotFound, GistStore
from .storage import Database


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    db = Database(settings.database_path)

    app = FastAPI(title="drawDB server")
    app.state.settings = settings
    app.state.diagrams = diagrams.DiagramStore(db)
    app.state.gists = GistStore(db)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.dev else settings.allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(GistNotFound)
    async def gist_not_found(request: Request, exc: GistNotFound):
        return JSONResponse(
            status_code=404, content={"success": False, "message": "Gist not found"}
        )

    @app.get("/", response_class=PlainTextResponse)
    async def root():
        return "Hello"

    app.include_router(diagrams.router)
    app.include_router(email_route.router)
    app.include_router(gists.router)

    return app
