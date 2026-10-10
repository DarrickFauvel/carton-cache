# Carton Cache

Track shipping carton inventory — new stock and collected reuse cartons — across one or more locations, and pick the right box while listing or shipping on eBay.

See [SPEC.md](./SPEC.md) for the original product spec (it predates several features below), and [CLAUDE.md](./CLAUDE.md) for architecture notes.

## Features

- **Carton types** with three sizes each: the size printed on the box, the actual inside size (used for fit suggestions), and the outer size (inside + wall thickness, used for eBay package dimensions). Cartons can be flagged resizable, or one-time-use (archived automatically once their stock runs out).
- **Stock movements**: receive, consume, transfer (one at a time or several at once), and adjust. Every movement is logged in an append-only transaction history.
- **Locations and sublocations**, e.g. a stack of cartons on an office shelf. Moving a sublocation moves its stock with it.
- **Dashboard** listing stock with a low-stock summary, sortable by size.
- **Labels**: printable label codes like `10x6x4-ama` (printed size + source code), printable from the carton form or dashboard.
- **Fit suggestions**: enter an item's dimensions and get the in-stock cartons that fit, including taller ones that can be cut down.
- **Barcode scanning** (camera + GS1-128 parsing) to look up or quick-create carton types.
- **Retail carton catalog**: a reference list of boxes you can buy from outside retailers when you run out.
- **Low-stock thresholds** per location and carton, surfaced on the dashboard, and **reports** with CSV export.
- **Multi-tenant**: each signup gets its own organization, with `admin`/`manager`/`staff`/`viewer` roles.
- **Chrome extension**: a side panel for picking and consuming a carton while on eBay. It's downloadable from `/extension` in the app.

## Stack

- **Server**: Node.js + Express 5, plain JavaScript (ES modules) type-checked with JSDoc + `tsc --noEmit`
- **Templates**: Eta (server-rendered)
- **UI**: Semantic HTML, modern CSS, plain Web Components bundled with esbuild
- **Database**: Turso (libSQL / SQLite-compatible)
- **Auth**: Session-based (argon2id), sessions stored in Turso

## Getting started

```sh
npm install
cp .env.example .env   # then fill in the values
npm run migrate
npm run build          # bundle Web Components and the Chrome extension
npm run dev            # http://localhost:3000
```

`.env` needs at least `SESSION_SECRET` and `TURSO_DATABASE_URL` (plus `TURSO_AUTH_TOKEN` for a remote database). SMTP (`SMTP_*`) is used for password-reset emails. Web Push keys (`VAPID_*`, generate with `npm run generate-vapid`) are optional: browsers can subscribe, but nothing sends notifications yet. Note that a `libsql://` URL means local development writes to that remote database.

On a brand-new database, migration `004_multitenancy.sql` currently fails (see the Migrations note in [CLAUDE.md](./CLAUDE.md)). It has to be rewritten before a fresh setup will migrate cleanly.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the server with `node --watch` |
| `npm start` | Run migrations, then start the server (production) |
| `npm run migrate` | Apply `src/db/migrations/` (safe to re-run) |
| `npm run build` | Bundle `src/components/` into `public/js/components/` and the extension into `extension/dist/` |
| `npm run build:extension` | Bundle only the Chrome extension |
| `npm run typecheck` | Type-check `src/` and `extension/` with `tsc` |
| `npm run generate-vapid` | Print a new VAPID keypair for Web Push |

There's no test suite or linter.

## Chrome extension

Run `npm run build:extension`, then load `extension/` unpacked in `chrome://extensions`, or download the zip from `/extension` in the running app. It uses the web app's session cookie, so sign in to the app first.
