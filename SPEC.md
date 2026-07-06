# Carton Cache — App Specification

## Context

**Who:** Solo developer who is also the operator — building this for their own e-commerce/fulfillment operation.  
**Scale:** Small — 1-2 locations, fewer than 20 carton types.  
**Current state:** No system exists. Stock is tracked by memory/feel. The app will define the workflow, not mirror one.  
**Floor UX:** Staff use personal phones or handheld scanners. Every interaction must be fast and thumb-friendly.  
**Hosting:** Self-hosted VPS (Fly.io, Railway, DigitalOcean, or similar). Single Node.js process, Turso for the database.

---

## Overview

Carton Cache tracks shipping carton inventory — both purchased (new) and salvaged from inbound deliveries (used) — so you always know what you have, where it is, and when to reorder. It logs every stock movement as an immutable transaction, alerts when stock gets low, and shows the dollar value of reuse vs. buying new.

---

## User Roles

| Role | Capabilities |
|---|---|
| **Admin** | Full access: manage locations, users, carton types, costs, thresholds, all reports |
| **Manager** | Manage inventory at assigned location(s), view reports, configure alerts |
| **Staff** | Log receive/consume/transfer transactions at assigned location |
| **Viewer** | Read-only: view stock levels and history |

> **v1 note:** Given the single-operator context, auth can start minimal (one admin account + optional staff invites) and expand later.

---

## Core Entities

### Organization
Every account belongs to an organization; every domain table is scoped by `org_id` and no query ever crosses organizations. Created automatically at signup along with the first `admin` user.

| Field | Type | Notes |
|---|---|---|
| `id` | text (ULID) | Primary key |
| `name` | text | |
| `plan` | text | `free` or `pro` — column exists for future billing, not currently enforced or charged |
| `default_tax_percent` | real | Optional — prefills new RetailCartonOption entries |
| `created_at` | integer | Unix timestamp |

### CartonType
Defines a class of carton independent of location or condition.

| Field | Type | Notes |
|---|---|---|
| `id` | text (ULID) | Primary key |
| `name` | text | Human label, e.g. "Medium Shipper" |
| `sku` | text | Optional — supplier part number |
| `barcode` | text | Optional — EAN/UPC/QR value for scanning |
| `length_cm` | real | Outer dimension |
| `width_cm` | real | Outer dimension |
| `height_cm` | real | Outer dimension |
| `unit_cost` | real | Purchase cost per new carton (your currency) |
| `notes` | text | Optional |
| `created_at` | integer | Unix timestamp |

### RetailCartonOption
A standalone reference catalog of cartons buyable from outside retailers (Walmart, Staples, etc.) when on-site stock runs short — **not** linked to `CartonType` or `InventoryLot` in any way; dimensions are in inches, not cm, since these are US retail products.

| Field | Type | Notes |
|---|---|---|
| `id` | text (ULID) | Primary key |
| `store_name` | text | e.g. "Staples" |
| `name` | text | |
| `sku` | text | Optional |
| `length_in`, `width_in`, `height_in` | real | Outer dimensions, inches |
| `weight_lb` | real | Optional |
| `cost` | real | Pre-tax store price |
| `tax_percent` | real | Optional — defaults from `Organization.default_tax_percent` |
| `notes` | text | Optional |
| `created_at` | integer | Unix timestamp |

Unique on `(org_id, store_name, sku)`.

### Condition
Enum representing quality — applied to every stock lot and transaction:

- `new` — unused, original condition (purchased stock)
- `good` — one prior use, fully intact (salvaged, top grade)
- `fair` — visible wear, still functional
- `poor` — damaged but usable

> Keeping all four grades from the start so reuse quality data is meaningful. The receive form can default to `good` for salvaged cartons to keep it fast.

### Location

| Field | Type | Notes |
|---|---|---|
| `id` | text (ULID) | Primary key |
| `name` | text | e.g. "Main Warehouse", "Off-site Storage" |
| `address` | text | Optional |
| `active` | integer | 0 or 1 |

### InventoryLot
Current on-hand count for a specific carton type + condition at a location.

| Field | Type | Notes |
|---|---|---|
| `id` | text (ULID) | Primary key |
| `location_id` | text | FK → Location |
| `carton_type_id` | text | FK → CartonType |
| `condition` | text | Enum: new/good/fair/poor |
| `quantity` | integer | Current count (≥ 0) |
| `updated_at` | integer | Unix timestamp of last change |

Unique constraint on `(location_id, carton_type_id, condition)`.

### Transaction
Append-only ledger — never deleted or updated.

| Field | Type | Notes |
|---|---|---|
| `id` | text (ULID) | Primary key |
| `type` | text | `receive`, `consume`, `transfer_out`, `transfer_in`, `adjustment` |
| `carton_type_id` | text | FK → CartonType |
| `condition` | text | Condition of cartons moved |
| `quantity` | integer | Always positive |
| `unit_cost_snapshot` | real | Cost at time of transaction (for `receive` of new cartons) |
| `location_id` | text | Location affected |
| `linked_transaction_id` | text | For transfers: links `transfer_out` ↔ `transfer_in` |
| `user_id` | text | FK → User |
| `notes` | text | Optional |
| `created_at` | integer | Unix timestamp |

### AlertThreshold

| Field | Type | Notes |
|---|---|---|
| `id` | text (ULID) | Primary key |
| `location_id` | text | FK → Location |
| `carton_type_id` | text | FK → CartonType |
| `condition` | text | `new`, `good`, `fair`, `poor`, or `any` |
| `min_quantity` | integer | Alert fires when on-hand ≤ this value |

### PushSubscription
Stores Web Push subscriptions for browser push notifications.

| Field | Type | Notes |
|---|---|---|
| `id` | text (ULID) | Primary key |
| `user_id` | text | FK → User |
| `endpoint` | text | Push service URL |
| `p256dh` | text | Public key |
| `auth` | text | Auth secret |
| `created_at` | integer | Unix timestamp |

### User

| Field | Type | Notes |
|---|---|---|
| `id` | text (ULID) | Primary key |
| `email` | text | Unique |
| `name` | text | Display name |
| `password_hash` | text | Argon2id |
| `role` | text | admin / manager / staff / viewer |
| `location_ids` | text | JSON array of assigned location IDs |
| `created_at` | integer | Unix timestamp |

---

## Features

### 1. Inventory Dashboard
- Stock levels per location, grouped by carton type
- Condition breakdown per row (new / good / fair / poor)
- Low-stock indicator when any lot is at or below its alert threshold
- Total estimated value of new stock on hand (quantity × unit_cost)
- Estimated cumulative reuse savings (quantity of non-new cartons × unit_cost of that type)
- **Not yet implemented**: filter/search by name, SKU, or barcode

### 2. Receive Stock
- Select location, carton type (or scan barcode), condition, quantity
- For `new` condition: unit cost pre-fills from CartonType but can be overridden (e.g. bulk discount)
- For salvaged cartons: condition defaults to `good`, one tap to downgrade
- Notes field: optional (e.g. "from ACME PO-1234", "from today's inbound")
- Creates a `receive` transaction → increments InventoryLot

### 3. Consume / Pull
- Select location, carton type, condition, quantity
- Warn (not block) if quantity exceeds available stock
- Creates a `consume` transaction → decrements InventoryLot
- Optionally: condition auto-suggests highest-condition available

### 4. Transfer Between Locations
- Select source location, destination, carton type, condition, quantity
- Atomic: creates linked `transfer_out` + `transfer_in` pair
- Both InventoryLots update in the same transaction

### 5. Inventory Adjustment
- Admin/Manager only — correct a quantity discrepancy
- Mandatory note required
- Creates an `adjustment` transaction

### 6. Barcode / QR Scanning
- Scan button on all receive/consume/transfer forms
- Web Component using the HTML5 `BarcodeDetector` API
- ZXing-js polyfill for unsupported browsers
- Matches scanned value against `CartonType.barcode`; auto-fills the form

### 7. Low-Stock Alerts

Currently implemented: **in-app only** — the dashboard compares on-hand quantity per `(location, carton_type, condition)` against `AlertThreshold` inline and shows a low-stock indicator; there's no separate threshold-evaluation/dispatch service and no "reset" event, it just reflects current state on every dashboard load.

Email and browser push are scaffolded but **not wired to alert firing**:
- Nodemailer is configured and used today only for password-reset emails (`src/services/email.js`); nothing sends a low-stock email.
- `push_subscriptions` are stored via `/push/subscribe` and the service worker can display an incoming push, but no UI ever calls `/push/subscribe` (the endpoint is unreachable from any page) and no server code ever calls `webpush.sendNotification`.

Turning either of these into a real delivery channel is future work, not done.

### 8. Cost & Reuse Reporting

- **Stock value**: current new-stock quantity × unit cost per carton type
- **Reuse savings**: total salvaged cartons received × unit cost = estimated savings vs. buying new
- **Spend tracking**: total cost of all `receive new` transactions over a date range
- **Consumption trends**: cartons used per week, by type — rendered as a table (no chart/Web Component; see Architecture)
- **Transaction history**: filterable log (date range, type, location, user, carton type)
- **Stock snapshot**: exportable CSV of current on-hand levels

### 9. Retail Carton Reference Catalog

A separate, unrelated feature from on-site inventory (see `RetailCartonOption` above): a lookup table of cartons buyable from outside retailers when on-site stock runs short, at `/retail-cartons` (list/add/edit/delete, admin+manager). `/settings` (admin-only) configures an org-level `default_tax_percent` that prefills new entries so store prices (pre-tax) can show a tax-inclusive total; each entry can still override the rate individually.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js + JavaScript | JSDoc type annotations, checked via `tsc --noEmit` (strict mode) |
| HTTP server | Express 5 | Middleware routing |
| Templating | Eta | Server-rendered HTML |
| Reactivity | Datastar | SSE helper (`src/lib/sse.js`) and CDN `<script>` tag are wired in, but currently unused — no route emits Datastar events and no view has `data-*` signals; all forms are plain HTML submits today |
| UI components | HTML Web Components | Barcode/QR scanning, quick-create, avatar menu, theme toggle — see Architecture for the full list |
| Styling | Modern CSS | Custom properties, container queries — no framework |
| Database | Turso (libSQL) | SQLite-compatible; edge-ready for future scaling |
| Auth | Session-based | express-session + argon2id |
| Push notifications | Web Push API | `web-push` npm package + service worker |
| Email | Nodemailer | SMTP; config via env vars |
| Barcode scanning | BarcodeDetector API | ZXing-js fallback |

---

## Architecture

```
browser
  │  Semantic HTML + Modern CSS, plain HTML form submits
  │  Datastar CDN script present but inert — no data-* signals in use yet
  │  Web Components (see below)
  │  Service Worker: static-shell caching + offline fallback page;
  │    can render a push notification if one ever arrives (nothing sends one yet)
  ▼
Express (JavaScript + JSDoc) — single process, VPS deployment
  ├── routes/
  │     ├── auth.js              register, login, logout, forgot/reset password
  │     ├── dashboard.js         stock overview + inline low-stock indicator
  │     ├── transactions.js      receive, consume, transfer, adjust, history
  │     ├── cartons.js           carton type CRUD + barcode lookup
  │     ├── retail-cartons.js    RetailCartonOption CRUD (unrelated reference catalog)
  │     ├── locations.js         location CRUD
  │     ├── alerts.js            AlertThreshold CRUD (no dispatch — see Features #7)
  │     ├── push.js              Web Push subscription storage (unused — see Features #7)
  │     ├── reports.js           cost, savings, history, trends, CSV export
  │     ├── users.js             user management (admin only)
  │     ├── profile.js           own-account name/avatar/password
  │     └── settings.js          org default tax % (admin only)
  ├── services/
  │     ├── inventory.js         apply transactions, update lots atomically — the only writer of inventory_lots/transactions
  │     └── email.js             Nodemailer — password reset only, not alert dispatch
  ├── db/
  │     ├── client.js            Turso libSQL client
  │     └── migrations/          versioned SQL files
  ├── views/                     Eta templates
  │     ├── layouts/
  │     ├── pages/
  │     └── partials/
  ├── public/
  │     ├── sw.js                Service worker (static-shell cache + offline fallback; can display a push if one ever arrives)
  │     └── js/components/       Bundled Web Component JS (esbuild output)
  └── components/                Web Component source (JavaScript + JSDoc)
        ├── barcode-scanner.js   camera capture + BarcodeDetector API (ZXing CDN fallback)
        ├── carton-scanner.js    composes barcode-scanner + gs1.js to look up/quick-create a carton type
        ├── gs1.js               GS1-128 barcode payload parsing
        ├── quick-create.js      inline "create carton type" form used mid-scan
        ├── qr-modal.js          QR code display modal
        ├── avatar-menu.js       header user menu
        └── theme-selector.js    light/dark theme toggle
```

---

## Key Pages

| Route | Description |
|---|---|
| `GET /` | Dashboard — stock levels, inline low-stock indicator, savings summary |
| `GET /register` | Create org + first admin user |
| `GET /login`, `GET /forgot-password`, `GET /reset-password/:token` | Auth flows |
| `GET /locations/:id` | Single-location stock detail |
| `GET /transactions/receive` | Receive stock form |
| `GET /transactions/consume` | Consume stock form |
| `GET /transactions/transfer` | Transfer form (source → destination) |
| `GET /transactions/adjust` | Inventory adjustment form (admin/manager only) |
| `GET /transactions` | Full transaction history |
| `GET /cartons` | Carton type list |
| `GET /cartons/new` | Add a carton type |
| `GET /cartons/:id/edit` | Edit carton type (name, SKU, cost, barcode, dimensions) |
| `GET /retail-cartons` | Retail carton reference catalog (unrelated to on-site inventory) |
| `GET /alerts` | Alert threshold configuration |
| `GET /reports` | Cost, savings, and consumption reporting |
| `GET /reports/snapshot.csv` | CSV export of current stock snapshot |
| `GET /profile` | Own name, avatar color, password |
| `GET /settings` | Org default sales tax % for retail carton options (admin only) |
| `GET /users` | User management (admin only) |

---

## Mobile UX Considerations

Staff log activity on personal phones. Every form must work as a one-handed, thumb-first interaction:

- Touch targets ≥ 44×44px
- Barcode scan as the primary carton-selection method (not searching a dropdown)
- Quantity input uses `inputmode="numeric"` — numeric keyboard on mobile
- Forms are single-page, minimal scrolling — progressive disclosure for optional fields
- **Not yet implemented**: in-place submission confirmation via Datastar SSE — forms currently do a full page reload on submit (see Tech Stack)

---

## Non-Functional Requirements

- **Audit trail**: transactions are append-only — no DELETE or UPDATE on the transactions table
- **Consistency**: InventoryLot updates and transaction inserts happen in a single libSQL transaction
- **Security**: parameterized queries throughout, role middleware on every route. `csrf-csrf` is a dependency but is not currently wired into `app.js` — no route actually issues or checks a CSRF token yet
- **Accessibility**: semantic HTML, ARIA where Web Components require it, no color-only indicators
- **Offline**: service worker caches the app shell; pending submits are queued and replayed on reconnect (stretch goal)

---

## Out of Scope (v1)

- Purchase order management or supplier integration
- Barcode label printing
- Native mobile app
- Webhook / Slack notifications
- Weight / volume tracking beyond outer dimensions (except `RetailCartonOption.weight_lb`, tracked separately since retail listings include it)
- Billing/plan enforcement — `Organization.plan` (`free`/`pro`) exists in the schema for future use but nothing reads or enforces it today
