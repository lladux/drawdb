# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

drawDB is an ERD editor and SQL generator (React 18 + Vite, plain JS/JSX, no TypeScript). Upstream is browser-only and stores diagrams in IndexedDB. **In this fork, diagrams, sharing and version history are stored in SQLite by the Python/FastAPI backend in `server/`**, so the editor needs that server running. Templates stay in IndexedDB.

## Commands

This fork uses **pnpm** (version pinned in `package.json` `packageManager`); don't use npm or add a `package-lock.json`.

```bash
pnpm install
pnpm dev       # Vite dev server
pnpm build     # production build to dist/
pnpm lint      # ESLint, --max-warnings 0 (warnings fail)
pnpm preview   # serve the built bundle
```

Dependency build scripts are blocked unless listed under `allowBuilds` in `pnpm-workspace.yaml` (`@tailwindcss/oxide` and `core-js` are explicitly denied; neither is needed).

There is no test suite and no CI; check changes with `pnpm lint` and `pnpm build` locally. A Husky pre-commit hook runs `pnpm exec lint-staged` (ESLint `--fix` + Prettier on staged files).

Backend URL: `src/config/index.js` resolves it in this order: `window.__DRAWDB_CONFIG__` (set by `public/config.js`, empty by default; lets a static host change the URL without rebuilding), then the Vite env var (`.env`, see `.env.sample`), then `http://localhost:5000`.

## Conventions (from CONTRIBUTING.md)

- Format with Prettier and pass ESLint.
- Commit messages use the present tense and imperative mood ("Add Spanish locale").
- Code, comments and identifiers are in English.
- Keep PRs atomic: one feature or one fix.

## Architecture

### Routing and pages

`src/App.jsx` sets up routes: `/` (landing), `/editor`, `/editor/diagrams/:id`, `/editor/templates/:id`, `/templates`, `/bug-report`. `src/pages/Editor.jsx` wraps `components/Workspace.jsx` in a deep stack of context providers. Some contexts depend on others through hooks (for example, `DiagramContext` uses `useTransform`, `useUndoRedo`, `useSelect` and `useCollab`), so **provider order matters**.

### State: contexts and hooks

Each diagram entity type has its own context in `src/context/` (Diagram = tables + relationships + database + sqlHeader, Areas, Notes, Types, Enums, Views), plus cross-cutting ones: Transform (pan/zoom), Select, UndoRedo, Layout, Settings, SaveState, Canvas, Collab. Each context has a matching hook in `src/hooks/`, re-exported from `src/hooks/index.js`. Import hooks from `../hooks`.

Mutators in the entity contexts (`addTable`, `updateTable`, `deleteTable`, …) take an `addToHistory` flag and push entries onto the undo stack themselves.

### Undo/redo

`UndoRedoContext` holds only two arrays. Each entry is a plain object like `{ action: Action.*, element: ObjectType.*, data, message, ... }`, and there are bulk variants (`bulk: true, elements: [{ type, id, undo, redo }]`) and DBML snapshot variants. The interpretation lives in `undo()`/`redo()` in `components/EditorHeader/ControlPanel.jsx`. **A new kind of edit must push a well-formed entry and be handled in both functions there.** Side-panel editors (e.g. `RelationshipInfo.jsx`, `ViewInfo.jsx`) build `undo`/`redo` partial objects and push `Action.EDIT` entries. `Timeline.jsx` renders the stack's `message` fields.

### Persistence and autosave

Diagrams are saved to the backend through the editor's "cloud" extension hooks: `src/pages/Editor.jsx` provides `serverStorage` from `src/api/diagrams.js` (`cloudSave`/`cloudLoad`/`cloudList`/`cloudDelete`) via `ExtensionsContext`. With those hooks present, `Workspace.jsx`, `ControlPanel.jsx` (save, save as, delete) and the Open modal (`useDiagramList`) take their cloud code paths. In the UI these are labelled "Server". Diagrams that are still in IndexedDB from before show up as "Local", and a banner offers to move each one to the server.

`src/data/db.js` defines the Dexie (IndexedDB) database `drawDB`. It still holds `templates` (seeded from `src/templates/` via `data/seeds.js`) and any older local `diagrams`. A schema change requires bumping `db.version(...)` and adding an upgrade.

`Workspace.jsx` owns `save()`/`load()`. A `useEffect` watches the undo/redo stacks, entity counts, zoom, title, etc. When autosave is on, it sets `SaveState` to `State.SAVING`, and another effect then calls `save()`. Loading resolves from the route: diagram id, template id, or a shared gist (`?shareId=`, `api/gists.js`). Sharing and version history use gists, which the backend now keeps in SQLite.

### Collaboration hooks

`CollabContext` is currently a no-op stub (`emitDelta`, `isApplyingRemoteRef`). Entity contexts already call `emitDelta(...)` on mutations unless `isApplyingRemoteRef.current` is set. Keep that pattern when adding mutators.

### Database dialects

`DB` in `src/data/constants.js` lists the dialects: mysql, postgresql, transactsql (MSSQL), sqlite, mariadb, oraclesql and generic. Per-dialect data is spread across several places that must stay in sync when adding a feature or dialect:

- `data/databases.js`: dialect metadata and capability flags (`hasTypes`, `hasEnums`, `hasArrays`, `hasUnsignedTypes`, …) that gate UI features.
- `data/datatypes.js`: per-dialect type definitions (with validation regexes and properties), exposed through `dbToTypes`.
- `utils/exportSQL/<dialect>.js`, dispatched by `exportSQL/index.js`. A diagram's `sqlHeader` is prepended to the output. `generic.js` converts a generic diagram to a concrete dialect.
- `utils/importSQL/<dialect>.js`, dispatched by `importSQL/index.js`. The input is an AST from `node-sql-parser` (or `oracle-sql-parser` for Oracle), parsed in `components/EditorHeader/Modal/Modal.jsx`. Imported tables are then laid out with `arrangeTables`.

### Other formats

- DBML: `utils/dbml/` (parse via `@dbml/core`, then diff, reconcile and apply a plan, which lets the live DBML editor patch the diagram incrementally), `utils/importFrom/dbml.js` and `utils/exportAs/dbml.js`.
- JSON / `.ddb` import is validated with `jsonschema` against the schemas in `data/schemas.js` (`utils/validateSchema.js`). Update those schemas when adding fields to entities.
- Mermaid and Markdown documentation export are in `utils/exportAs/`. Migrations (diff between versions to SQL) are in `utils/diff.js` and `utils/migrations/diffToSQL.js`.
- `utils/issues.js` computes schema validation warnings shown in the Issues panel.

### Canvas

`components/EditorCanvas/` renders the diagram as SVG (`Canvas.jsx`, plus `Table`, `Relationship`, `Area`, `Note` and `View` components). Relationship paths come from `utils/calcPath.js`. Layout constants (table width, field height, grid size) are in `data/constants.js`. Auto-layout is in `utils/arrangeTables.js` and `utils/autoArrange.js` (dagre).

### UI and i18n

The UI uses Semi UI (`@douyinfe/semi-ui`) components and Toasts, Tailwind v4 for styling, and Monaco for code editors. All user-facing strings go through `react-i18next` `t(...)`. `src/i18n/locales/en.js` is the source locale; other locales are registered in `src/i18n/i18n.js` (both the import and the `languages` array). RTL handling is in `i18n/utils/rtl.js`. Add new keys to `en.js` at minimum; missing keys fall back to English.

## Backend (`server/`)

FastAPI app with its own venv; it is independent of the pnpm toolchain. Storage is SQLite via the stdlib `sqlite3` (`app/storage.py`, schema created on startup, default file `server/data/drawdb.sqlite3`). See `server/README.md` for the API.

```bash
cd server && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/python -m app                      # run on $PORT (default 5000)
.venv/bin/pytest                             # all tests
.venv/bin/pytest tests/test_gists.py::test_compare
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```

- `app/main.py` `create_app(settings)` is the app factory. Tests (`tests/conftest.py`) give each test its own temporary SQLite file.
- `app/diagrams.py`: `/diagrams` CRUD. The full diagram JSON is stored in one column, with name, database, size and timestamps as columns for listing.
- `app/gist_store.py`: a SQLite stand-in for the GitHub Gists API. Each change stores a full snapshot of the gist's files as a revision with a random 40-hex `version`, and an update that changes nothing creates no revision. `app/gists.py` serves it with GitHub-shaped JSON.
- Routes and JSON shapes must stay compatible with `src/api/diagrams.js`, `src/api/gists.js` and `src/api/email.js`. `GET /gists/{id}/{sha}` is declared last in `app/gists.py` so it doesn't shadow `/commits`.
- Env vars: `HOST` (default `127.0.0.1`; there is no auth), `PORT`, `DATABASE_PATH`, `CLIENT_URLS`, `MAIL_*`, and `NODE_ENV=dev` for open CORS and reload.
- Routes that touch SQLite or SMTP are sync `def` on purpose, so FastAPI runs the blocking calls in a thread pool.
