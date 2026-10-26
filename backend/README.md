# drawDB server (Python)

Python (FastAPI) backend for this fork of drawDB, started as a port of [drawdb-io/drawdb-server](https://github.com/drawdb-io/drawdb-server). It:

1. Stores diagrams in a SQLite database (`/diagrams`), grouped into workspaces (`/workspaces`) that can each have a password.
2. Stores shared diagrams and version history in the same database (`/gists/...`). The routes and JSON keep the shape of the GitHub Gists API that the original server proxied, so the frontend's sharing and versioning code is unchanged, but nothing is sent to GitHub.
3. Sends bug reports by email (`POST /email/send`).

The editor needs this server running: diagrams are no longer saved in the browser.

## Running

Copy `.env.sample` to `.env` and adjust it.

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m app        # http://127.0.0.1:5000 by default
```

With the venv active, `fastapi dev --port 5000` also works (auto-reload on code changes). Pass `--port 5000`: the CLI ignores `PORT` and defaults to 8000, which the frontend doesn't use.

`requirements.txt` has what the server needs to run, pinned to tested versions; `requirements-dev.txt` adds the test and lint tools. Run commands from the `backend/` directory.

The database is created at `backend/data/drawdb.sqlite3` (override with `DATABASE_PATH`). Back up that file to back up all diagrams.

The frontend talks to `http://localhost:5000` by default; change it with `VITE_BACKEND_URL` in `frontend/.env`. Without a `.env`, the server accepts requests from any frontend on `localhost`, `127.0.0.1` or `[::1]`; set `CLIENT_URLS` to allow other origins (it then replaces that default).

## Workspaces and passwords

Every diagram belongs to a workspace. On first start the server creates a `Personal` workspace without a password and moves any existing diagrams into it.

A workspace can have a password (hashed with scrypt). `POST /workspaces/{id}/unlock` checks it and returns a token signed with a key stored in the database. Clients send their tokens in the `X-Workspace-Tokens` header (comma-separated, one per unlocked workspace), and requests for a locked workspace's diagrams get `401` with `{"workspaceId": ...}`. Tokens last 30 days, and changing or removing a password invalidates the old ones. A forgotten password can't be recovered.

Passwords are optional and live in one module, `app/auth.py`. To run without them, set `AUTH_ENABLED=false`: every workspace is then open, setting or removing a password returns `400`, and `/unlock` doesn't exist. Passwords already stored are kept (the server logs a warning on startup), so setting `AUTH_ENABLED=true` again locks those workspaces again. `GET /config` reports `{"auth": true|false}`, and the hub uses it to hide the password options.

Workspaces without a password, workspace names, and shared diagrams (`/gists`, which work by unguessable link) are open to anyone who can reach the server. It listens on `127.0.0.1` by default; only set `HOST=0.0.0.0` on a network you trust, and put it behind HTTPS if it leaves your machine, since passwords and tokens travel in plain text otherwise.

## API

| Method and path                               | Purpose                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /diagrams`                               | Diagrams in every workspace you can open (summaries, newest first)                      |
| `GET /diagrams/{id}`                          | Full diagram                                                                            |
| `PUT /diagrams/{id}`                          | Create or replace a diagram; a new one goes to `workspaceId` (or the default workspace) |
| `GET /config`                                 | Features the server has on (`auth`)                                                     |
| `PATCH /diagrams/{id}`                        | Rename (`name`) or move (`workspaceId`) a diagram                                       |
| `DELETE /diagrams/{id}`                       | Delete a diagram                                                                        |
| `GET /workspaces`                             | Workspaces, with `protected` and `unlocked` flags                                       |
| `POST /workspaces`                            | Create a workspace (`name`, optional `password`); returns a token if protected          |
| `PATCH /workspaces/{id}`                      | Rename or change the password (`""` removes it)                                         |
| `DELETE /workspaces/{id}`                     | Delete a workspace and its diagrams                                                     |
| `POST /workspaces/{id}/unlock`                | Check the password and get a token (only with `AUTH_ENABLED`)                           |
| `GET /workspaces/{id}/diagrams`               | The workspace's diagrams, with preview data for thumbnails                              |
| `POST /gists`                                 | Create a gist with one file                                                             |
| `GET /gists/{id}`                             | Gist with the latest files                                                              |
| `PATCH /gists/{id}`                           | Change a file; omit `content` to remove it (an empty gist is deleted)                   |
| `DELETE /gists/{id}`                          | Delete a gist                                                                           |
| `GET /gists/{id}/commits`                     | Revisions, newest first (`per_page`, `page`)                                            |
| `GET /gists/{id}/{sha}`                       | Gist at a revision                                                                      |
| `GET /gists/{id}/file-versions/{file}`        | Revisions that changed a file (`limit`, `cursor`)                                       |
| `GET /gists/{id}/file/{file}/compare/{a}/{b}` | A file's content at two revisions (`b` may be `null`)                                   |
| `POST /email/send`                            | Send a bug report                                                                       |

## Tests and lint

```bash
.venv/bin/pytest
.venv/bin/pytest tests/test_gists.py::test_compare   # a single test
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```

Each test gets its own temporary SQLite file, and SMTP is stubbed, so tests need no network or credentials.

## Differences from the original

- Diagrams are stored here instead of in the browser's IndexedDB, in password-protectable workspaces.
- Gists live in SQLite instead of GitHub, so `GITHUB_TOKEN` is gone.
- Attachments in bug reports must be base64 `data:` URIs. The original passed `path` straight to nodemailer, which also accepts server file paths and URLs.
- Missing `subject`/`message` returns 400 and stops. The original sent the 400 and then tried to send the email anyway.
- SMTP is configured with `MAIL_SERVICE` (a few known providers) or `MAIL_HOST`/`MAIL_PORT`, instead of nodemailer's service list.

## License

The original server is MIT licensed; its notice is kept in `LICENSE-drawdb-server`.
