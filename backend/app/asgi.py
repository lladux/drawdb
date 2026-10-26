# Module-level app for `fastapi dev` and `fastapi run`, which can't call a factory on their own.
# Tests use create_app() directly, so importing app.main stays free of side effects.
from .main import create_app

app = create_app()
