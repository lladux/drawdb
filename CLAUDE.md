# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

drawDB is a browser-only ERD editor and SQL generator (React 18 + Vite, plain JS/JSX, no TypeScript). No account or backend is needed; diagrams are stored locally in IndexedDB. An optional separate server ([drawdb-server](https://github.com/drawdb-io/drawdb-server)) is used only for sharing (gists).

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

There is no test suite. CI (`.github/workflows/build.yml`) runs `pnpm lint` and `pnpm build` on Node 20 and 22, so both must pass. A Husky pre-commit hook runs `pnpm exec lint-staged` (ESLint `--fix` + Prettier on staged files).

Docker: `docker build -t drawdb . && docker run -p 3000:80 drawdb`. The image serves `dist/` via nginx and generates `/config.js` at runtime from `VITE_BACKEND_URL` / `VITE_GIST_BACKEND_URL`, which sets `window.__DRAWDB_CONFIG__`. `src/config/index.js` resolves the backend URL in this order: runtime config, then the Vite env var (`.env`, see `.env.sample`), then `http://localhost:5000`.

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

`src/data/db.js` defines the Dexie (IndexedDB) database `drawDB` with `diagrams` and `templates` tables. Templates are seeded from `src/templates/` via `data/seeds.js`. A schema change requires bumping `db.version(...)` and adding an upgrade.

`Workspace.jsx` owns `save()`/`load()`. A `useEffect` watches the undo/redo stacks, entity counts, zoom, title, etc. When autosave is on, it sets `SaveState` to `State.SAVING`, and another effect then calls `save()`. Loading resolves from the route: diagram id, template id, a shared gist (`api/gists.js`), or the most recently modified diagram.

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
