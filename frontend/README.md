# drawDB frontend

The React app: the hub of diagrams and the ERD editor. It is plain JavaScript/JSX (no TypeScript) built with Vite, styled with Tailwind v4 and [Semi UI](https://semi.design) components.

Diagrams, sharing and version history are saved by the backend in [`../backend`](../backend/README.md), so it must be running for the editor to save. Templates and diagrams created before the backend existed are kept in the browser's IndexedDB.

## Running

Use **pnpm** (the version is pinned in `package.json` under `packageManager`); don't use npm or commit a `package-lock.json`.

```bash
pnpm install
pnpm dev       # dev server on http://localhost:5173
pnpm build     # production build in dist/
pnpm preview   # serve dist/
pnpm lint      # ESLint; any warning fails
```

There is no test suite: check a change with `pnpm lint` and `pnpm build`. A pre-commit hook (Husky, from the repo root) runs ESLint `--fix` and Prettier on the staged files.

Dependency install scripts are blocked unless listed under `allowBuilds` in `pnpm-workspace.yaml`.

## Configuration

The backend URL is resolved by `src/config/index.js`, first match wins:

1. `window.__DRAWDB_CONFIG__.backendUrl`, set in `public/config.js`. It is empty by default and is served as is, so a static host can point the built app at another backend without rebuilding.
2. `VITE_BACKEND_URL` in `.env` (copy `.env.sample`), read at build time.
3. `http://localhost:5000`.

Sharing and version history use the same URL unless `gistBackendUrl` / `VITE_GIST_BACKEND_URL` is set.

## Pages

| Route                             | Page               | What it is                                                       |
| --------------------------------- | ------------------ | ---------------------------------------------------------------- |
| `/`                               | `pages/Hub.jsx`    | Workspaces in a sidebar and the selected one's diagrams as cards |
| `/editor`, `/editor/diagrams/:id` | `pages/Editor.jsx` | A new diagram, or a saved one                                    |
| `/editor/templates/:id`           | `pages/Editor.jsx` | A copy of a template                                             |
| `/editor?shareId=…`               | `pages/Editor.jsx` | A shared diagram                                                 |
| `/templates`, `/bug-report`       | `pages/…`          | Template gallery and bug report form                             |

## Layout of `src/`

```
api/          calls to the backend: diagrams, workspaces, auth (workspace
              passwords and tokens), gists (sharing and versions), email
components/   UI. EditorCanvas/ draws the diagram, EditorHeader/ is the menu
              bar, toolbar and modals, EditorSidePanel/ the tabs on the left,
              Hub/ the home page cards and dialogs
context/      React contexts holding the editor's state (one per entity type
              plus cross-cutting ones such as undo/redo and selection)
hooks/        one hook per context, re-exported from hooks/index.js
data/         constants, dialect definitions and types, JSON schemas, Dexie
              (IndexedDB) setup
utils/        everything that isn't UI: SQL import/export per dialect, DBML,
              other export formats, migrations, line routing, auto-layout
i18n/         translations (English, Spanish, Simplified and Traditional
              Chinese)
templates/    the built-in diagram templates
```

## How the editor works

**State.** `pages/Editor.jsx` wraps `components/Workspace.jsx` in a stack of context providers. Each kind of diagram entity has its own context (tables and relationships in `DiagramContext`, plus areas, notes, types, enums and views), alongside cross-cutting ones for pan/zoom, selection, undo/redo, layout and save state. Some contexts use others, so the order of the providers matters. Components read state through the hooks in `hooks/`.

**Undo and redo.** Every change goes through a mutator such as `addTable` or `updateRelationship`, which also pushes an entry describing it onto the undo stack. `undo()` and `redo()` in `components/EditorHeader/ControlPanel.jsx` interpret those entries, so a new kind of change needs an entry and handling there in both functions.

**Saving.** `Workspace.jsx` watches the diagram and, with autosave on, saves it to the backend through `api/diagrams.js`. A diagram opened from a password-protected workspace without a valid token sends you to the hub to unlock it, then back.

**Drawing.** The canvas (`components/EditorCanvas/Canvas.jsx`) is one SVG. Relationship lines are orthogonal routes computed in `utils/orthogonalRouting.js`: an A\* search around tables and views, then a pass that spreads apart lines sharing a segment. Clicking a line shows a handle per segment to reshape it; a reshaped line keeps its route, stored on the relationship as `waypoints`, until it is reset from the relationship panel.

**Databases.** Each SQL dialect (MySQL, PostgreSQL, SQL Server, SQLite, MariaDB, Oracle and a generic one) has its types in `data/datatypes.js`, its capabilities in `data/databases.js`, and its own importer and exporter in `utils/importSQL/` and `utils/exportSQL/`. Adding a feature that depends on the dialect usually means touching all four.

**Other formats.** Besides SQL, diagrams export to JSON, DBML, Mermaid, Markdown documentation, SQLAlchemy and Entity Framework Core models (`utils/exportAs/`) and to images and PDF. A live DBML editor patches the diagram as you type (`utils/dbml/`).

## Conventions

- All user-facing text goes through `t(...)` from `react-i18next`. Add new keys to `src/i18n/locales/en.js` at least; missing translations fall back to English.
- Code, comments and identifiers are in English, formatted with Prettier.
- When adding a field to an entity, update the JSON schemas in `data/schemas.js`, which validate imported files.
