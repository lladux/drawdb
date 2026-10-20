<div align="center">
    <img width="64" alt="drawDB logo" src="./src/assets/icon-dark.png">
    <h1>drawDB</h1>
</div>

<h3 align="center">Free, simple, and intuitive database schema editor and SQL generator.</h3>

> [!NOTE]
> This is a personal fork of [drawdb-io/drawdb](https://github.com/drawdb-io/drawdb), modified for personal use. It is not affiliated with or endorsed by the drawDB project. Changes from upstream include switching the package manager to pnpm and porting the backend to Python with SQLite storage (`server/`). Like the original, it is licensed under the [GNU AGPL-3.0](LICENSE).

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

### Local Development

```bash
git clone https://github.com/drawdb-io/drawdb
cd drawdb
pnpm install
pnpm dev
```

### Build

```bash
git clone https://github.com/drawdb-io/drawdb
cd drawdb
pnpm install
pnpm build
```

In this fork, diagrams, sharing and version history are stored in SQLite by the Python backend in [`server/`](server/README.md), so it must be running for the editor to save. See its README for setup. Set `VITE_BACKEND_URL` (see `.env.sample`) if it isn't on `http://localhost:5000`.

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## Support

- Join discussions: [Discord](https://discord.gg/BrjZgNrmR6)
