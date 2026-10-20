from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from . import email_route, gists
from .config import Settings, load_settings
from .github import GistService, create_github_client


def create_app(
    settings: Settings | None = None,
    github_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with create_github_client(settings.github_token, github_transport) as http:
            app.state.gists = GistService(http)
            yield

    app = FastAPI(title="drawDB server", lifespan=lifespan)
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.dev else settings.allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/", response_class=PlainTextResponse)
    async def root():
        return "Hello"

    app.include_router(email_route.router)
    app.include_router(gists.router)

    return app
