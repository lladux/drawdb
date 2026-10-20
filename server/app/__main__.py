import uvicorn

from .config import load_settings


def main():
    settings = load_settings()
    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host="0.0.0.0",
        port=settings.port,
        reload=settings.dev,
    )


if __name__ == "__main__":
    main()
