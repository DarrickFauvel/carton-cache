# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the server with `node --watch` (auto-restarts on file change). No build step; `src/**/*.js` runs directly.
- `npm run typecheck` — type-check the whole `src/` tree via `tsc` (see "Types" below). This is the only "compile" step in this project; it emits nothing (`noEmit: true`), it only reports errors.
- `npm run build` — bundles the browser Web Components (`src/components/*.js`) into `public/js/components/*.js` via esbuild. Run this after changing anything in `src/components/`; the server does not do this automatically.
- `npm run migrate` — applies any unapplied files in `src/db/migrations/` to the Turso DB pointed at by `.env`. Safe to re-run: already-applied `ALTER TABLE ADD COLUMN` statements are caught and skipped (see `src/db/migrate.js`), though this only handles the "duplicate column name" case, not other partial-migration failures.
- `npm start` — runs `migrate` then starts the server; this is the production entrypoint.
- `npm run generate-vapid` — prints a new VAPID keypair for Web Push, to be pasted into `.env`.
- There is no test suite and no linter configured in this repo.

## Types: JSDoc, not TypeScript

Source is plain JavaScript (`"type": "module"`, no `.ts` files). Type-checking is done via JSDoc comments read by `tsc --noEmit` with `allowJs`/`checkJs` in `tsconfig.json`. When editing or adding code:

- Annotate with `@param`/`@returns`/`@type` JSDoc comments, not TS syntax — TS-only syntax (`as` casts, `!` non-null assertion, `interface`, type-only imports) is invalid in a `.js` file and will fail to parse.
- To cast a value inline, use the JSDoc parenthesized-cast form: `/** @type {Foo} */ (expr)`.
- Domain types live in `src/types.js` as `@typedef`s (e.g. `User`, `CartonType`, `RetailCartonOption`, `Condition`, `Role`). Reference them from other files with `/** @typedef {import("../types.js").Role} Role */` at the top of the file, then use `Role` normally in later JSDoc comments.
- `req.session.orgId`, `.userId`, etc. are typed as possibly-`undefined` by `@types/express-session` (`Session & Partial<SessionData>`) even though our own augmentation in `src/session.d.ts` declares them required — this is an upstream typing quirk, not a real runtime possibility once `requireAuth`/`requireRole` has run. Use the `defined()` helper from `src/lib/id.js` to narrow these (the JS equivalent of TS's `!`), e.g. `defined(req.session.orgId)`.
- `src/session.d.ts` is the one ambient `.d.ts` file in the project — it exists only because JSDoc has no equivalent for TypeScript's `declare module` augmentation. Don't add more `.d.ts` files for anything expressible as a `@typedef`.
- Class private fields use native `#field` syntax (not TS `private`), which works directly in modern Node and gets downleveled by esbuild for the browser bundle.

## Architecture

**Request flow**: `src/index.js` loads env (see below) then calls `createApp()` in `src/app.js`, which wires Eta as the view engine, session/cookie middleware, static file serving, and mounts one router per feature area from `src/routes/`. Routes are grouped by resource, not by HTTP verb — e.g. `src/routes/cartons.js` has the full CRUD for carton types, `src/routes/transactions.js` has receive/consume/transfer/adjust *and* history.

**Env loading**: `src/env.js` calls `process.loadEnvFile()` (Node's native `.env` loader, wrapped in try/catch since it throws if no `.env` exists) and must be the *first* static import in any entrypoint (`src/index.js`, `src/db/migrate.js`) — ES module imports evaluate before any other top-level code in the importing file, so if `./app.js` (which imports `db/client.js`, which reads `TURSO_DATABASE_URL` at module load) were imported first, env vars wouldn't be loaded yet.

**Multi-tenancy**: every domain table has an `org_id` column, and every query in every route filters by `req.session.orgId`. There is no cross-org data access anywhere — when adding a new table or route, always scope by `org_id`. Users get an org automatically on signup (`POST /register` creates both an `organizations` row and the first `admin` user in one `db.batch`).

**Auth**: session-based via `express-session`, with a custom Turso-backed session store (`src/lib/session-store.js`) instead of the default in-memory store. `src/middleware/auth.js` exports `requireAuth` (any logged-in user) and `requireRole(...roles)` (role gate), both of which redirect to `/login?next=...` if unauthenticated. Roles are `admin` > `manager` > `staff` > `viewer`, checked as an explicit allowlist per route (not a numeric hierarchy).

**Inventory as an event log**: `src/services/inventory.js` is the only place that mutates `inventory_lots` or inserts into `transactions`. Every stock movement (`receive`, `consume`, `transfer`, `adjust`) writes an immutable `transactions` row and updates the corresponding `inventory_lots` row(s) — `transactions` is append-only and is the audit trail; `inventory_lots` is the derived current-state cache keyed by `(location_id, carton_type_id, condition)`. Never update `inventory_lots` directly from a route handler.

**Two carton concepts**: `carton_types` (on-site inventory, dimensions in cm, tracked via `inventory_lots`/`transactions`) and `retail_carton_options` (`src/routes/retail-cartons.js`) are separate, unrelated tables — the latter is a standalone reference catalog of cartons buyable from outside retailers (Walmart, Staples, etc.) when on-site stock runs out, with dimensions in *inches* and no FK into the inventory system at all. Don't conflate the two.

**Views**: Eta templates under `src/views/`, one subdirectory per resource under `src/views/pages/`, plus `src/views/layouts/base.eta`. Routes pass data to `res.render()`; there's no client-side templating.

**Web Components**: `src/components/*.js` are plain custom elements (no framework), bundled independently by `esbuild.config.js` into `public/js/components/`. A page opts into one via `componentScripts: [...]` in the data passed to `res.render()` (see `base.eta` for how that array becomes `<script>` tags). `carton-scanner` composes `barcode-scanner` (camera + `BarcodeDetector` API, with a ZXing CDN fallback) and `gs1.js` (GS1-128 barcode payload parsing) to look up or quick-create a carton type from a scan.

**Datastar/SSE**: `src/lib/sse.js` wraps Datastar v1's SSE protocol (`datastar-patch-elements`/`datastar-patch-signals` events) but as of now nothing in the app actually calls it — no route uses it and no view has `data-*` Datastar attributes. It's present for future use; the CDN `<script>` tag in `base.eta` loading Datastar v1 is otherwise inert.

**Migrations**: plain numbered `.sql` files in `src/db/migrations/`, run in filename order by `src/db/migrate.js` via `executeMultiple`. `004_multitenancy.sql` has a known issue: on a from-scratch database, its rename→create→drop dance for `locations`/`carton_types` fails under Turso's FK enforcement (dropping a renamed-away table that other tables still reference by their rewritten FK clause) — it currently only works because the production DB was hand-repaired once already. If a fresh database is ever provisioned, that migration needs rewriting before `npm run migrate` will complete cleanly.

See `SPEC.md` for the original product spec (feature list, entity definitions, UX requirements) — note it predates several things that now exist (multi-tenancy, `/retail-cartons`, `/settings`) and is not fully in sync with the implementation.
