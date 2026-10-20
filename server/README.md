# drawDB server (Python)

Python (FastAPI) port of [drawdb-io/drawdb-server](https://github.com/drawdb-io/drawdb-server), the optional backend for drawDB. It does two things:

1. Sends bug reports by email (`POST /email/send`).
2. Proxies the GitHub Gists API used for sharing diagrams and version history (`/gists/...`).

Routes, request bodies, responses and environment variables match the original server, so the frontend works with either one.

## Running

Set up the environment variables by copying `.env.sample` to `.env`. `GITHUB_TOKEN` needs the `gist` scope.

```bash
cd server
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/python -m app        # listens on $PORT (default 5000)
```

Point the frontend at it with `VITE_BACKEND_URL=http://localhost:5000` (the frontend's default).

## Tests and lint

```bash
.venv/bin/pytest
.venv/bin/pytest tests/test_gists.py::test_revision   # a single test
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```

Tests use a fake GitHub API (`httpx.MockTransport`) and a stubbed SMTP sender, so they need no network or credentials.

## Docker

```bash
docker build -t drawdb-server server
docker run -p 5000:5000 --env-file server/.env drawdb-server
```

## Differences from the original

- Attachments in bug reports must be base64 `data:` URIs. The original passed `path` straight to nodemailer, which also accepts server file paths and URLs.
- Missing `subject`/`message` returns 400 and stops. The original sent the 400 and then tried to send the email anyway.
- `GET /gists/:id/file-versions/:file` stops paging once it reaches commits from before the file existed, and fetches each revision only once per request.
- SMTP is configured with `MAIL_SERVICE` (a few known providers) or `MAIL_HOST`/`MAIL_PORT`, instead of nodemailer's service list.

## License

The original server is MIT licensed; its notice is kept in `LICENSE-drawdb-server`.
