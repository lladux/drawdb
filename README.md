<div align="center">
    <img width="64" alt="drawDB logo" src="drawdb-logo.png">
    <h1>drawDB</h1>
</div>

<h3 align="center">Free, simple, and intuitive database schema editor and SQL generator.</h3>

> [!NOTE]
> This is a personal fork of [drawdb-io/drawdb](https://github.com/drawdb-io/drawdb), modified for personal use. It is not affiliated with or endorsed by the drawDB project. Changes from upstream include switching the package manager to pnpm and porting the backend to Python with SQLite storage, and splitting the code into `frontend/` and `backend/`, and replacing the landing page with a hub of diagrams in password-protectable workspaces. Like the original, it is licensed under the [GNU AGPL-3.0](LICENSE).

<div align="center" style="margin-bottom:12px;">
    <a href="https://drawdb.app/" style="display: flex; align-items: center;">
        <img src="https://img.shields.io/badge/Start%20building-grey" alt="drawDB"/>
    </a>
    <a href="https://discord.gg/BrjZgNrmR6" style="display: flex; align-items: center;">
        <img src="https://img.shields.io/discord/1196658537208758412.svg?label=Join%20the%20Discord&logo=discord" alt="Discord"/>
    </a>
    <a href="https://x.com/drawDB_" style="display: flex; align-items: center;">
        <img src="https://img.shields.io/badge/Follow%20us%20on%20X-blue?logo=X" alt="Follow us on X"/>
    </a>
</div>

<h3 align="center"><img width="700" style="border-radius:5px;" alt="drawDB screenshot demo" src="drawdb.png"></h3>

DrawDB is a robust and user-friendly database entity relationship diagram (ERD) editor right in your browser. Build diagrams with a few clicks, export and import SQL scripts, generate migrations, customize your editor, and more without creating an account. See the full set of features on [here](https://drawdb.app/).

## Getting Started

The repository has two independent parts:

- [`frontend/`](frontend/): the React editor (Vite, pnpm).
- [`backend/`](backend/README.md): the Python (FastAPI) server that stores diagrams, sharing and version history in SQLite. The editor needs it running to save.

### Local Development

Start the backend (see [its README](backend/README.md) for configuration):

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m app
```

Then, in another terminal, the frontend:

```bash
cd frontend
pnpm install
pnpm dev
```

### Build

```bash
cd frontend
pnpm install
pnpm build   # output in frontend/dist/
```

Set `VITE_BACKEND_URL` in `frontend/.env` (see `frontend/.env.sample`) if the backend isn't on `http://localhost:5000`.

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## Support

- Join discussions: [Discord](https://discord.gg/BrjZgNrmR6)
