# drawDB server (Python)

Python (FastAPI) backend for this fork of drawDB, started as a port of [drawdb-io/drawdb-server](https://github.com/drawdb-io/drawdb-server). It:

1. Stores diagrams in a SQLite database (`/diagrams`).
2. Stores shared diagrams and version history in the same database (`/gists/...`). The routes and JSON keep the shape of the GitHub Gists API that the original server proxied, so the frontend's sharing and versioning code is unchanged, but nothing is sent to GitHub.
3. Sends bug reports by email (`POST /email/send`).

The editor needs this server running: diagrams are no longer saved in the browser.

## Running

Copy `.env.sample` to `.env` and adjust it.

```bash
cd server
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/python -m app        # http://127.0.0.1:5000 by default
```

The database is created at `server/data/drawdb.sqlite3` (override with `DATABASE_PATH`). Back up that file to back up all diagrams.

The frontend talks to `http://localhost:5000` by default; change it with `VITE_BACKEND_URL`.

There is no authentication: anyone who can reach the server can read, change and delete every diagram. It listens on `127.0.0.1` by default; only set `HOST=0.0.0.0` on a network you trust.

## API

| Method and path                               | Purpose                                                               |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `GET /diagrams`                               | List diagrams (summaries, newest first)                               |
| `GET /diagrams/{id}`                          | Full diagram                                                          |
| `PUT /diagrams/{id}`                          | Create or replace a diagram                                           |
| `DELETE /diagrams/{id}`                       | Delete a diagram                                                      |
| `POST /gists`                                 | Create a gist with one file                                           |
| `GET /gists/{id}`                             | Gist with the latest files                                            |
| `PATCH /gists/{id}`                           | Change a file; omit `content` to remove it (an empty gist is deleted) |
| `DELETE /gists/{id}`                          | Delete a gist                                                         |
| `GET /gists/{id}/commits`                     | Revisions, newest first (`per_page`, `page`)                          |
| `GET /gists/{id}/{sha}`                       | Gist at a revision                                                    |
| `GET /gists/{id}/file-versions/{file}`        | Revisions that changed a file (`limit`, `cursor`)                     |
| `GET /gists/{id}/file/{file}/compare/{a}/{b}` | A file's content at two revisions (`b` may be `null`)                 |
| `POST /email/send`                            | Send a bug report                                                     |

## Tests and lint

```bash
.venv/bin/pytest
.venv/bin/pytest tests/test_gists.py::test_compare   # a single test
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```

Each test gets its own temporary SQLite file, and SMTP is stubbed, so tests need no network or credentials.

## Differences from the original

- Diagrams are stored here instead of in the browser's IndexedDB.
- Gists live in SQLite instead of GitHub, so `GITHUB_TOKEN` is gone.
- Attachments in bug reports must be base64 `data:` URIs. The original passed `path` straight to nodemailer, which also accepts server file paths and URLs.
- Missing `subject`/`message` returns 400 and stops. The original sent the 400 and then tried to send the email anyway.
- SMTP is configured with `MAIL_SERVICE` (a few known providers) or `MAIL_HOST`/`MAIL_PORT`, instead of nodemailer's service list.

## License

The original server is MIT licensed; its notice is kept in `LICENSE-drawdb-server`.
