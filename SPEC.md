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
- Filter/search by name, SKU, or barcode

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
Three delivery channels (user can configure which they want):

- **In-app**: persistent banner on dashboard until stock is replenished
- **Email**: sent via SMTP (Nodemailer) when threshold is first crossed
- **Browser push**: Web Push notification to subscribed devices (service worker)

Alert resets once stock rises above the threshold again.

### 8. Cost & Reuse Reporting

- **Stock value**: current new-stock quantity × unit cost per carton type
- **Reuse savings**: total salvaged cartons received × unit cost = estimated savings vs. buying new
- **Spend tracking**: total cost of all `receive new` transactions over a date range
- **Consumption trends**: cartons used per week/month by type (bar chart via Web Component)
- **Transaction history**: filterable log (date range, type, location, user, carton type)
- **Stock snapshot**: exportable CSV of current on-hand levels

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js + JavaScript | JSDoc type annotations, checked via `tsc --noEmit` (strict mode) |
| HTTP server | Express 5 | Middleware routing |
| Templating | Eta | Server-rendered HTML |
| Reactivity | Datastar | Signals + SSE for live updates and form submissions |
| UI components | HTML Web Components | Barcode scanner, charts, push subscription |
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
  │  Semantic HTML + Modern CSS
  │  Datastar (data-* signals, SSE fragments)
  │  Web Components: <barcode-scanner>, <stock-chart>, <push-subscribe>
  │  Service Worker (push notifications)
  ▼
Express (JavaScript + JSDoc) — single process, VPS deployment
  ├── routes/
  │     ├── auth.js              login, logout, session
  │     ├── dashboard.js         stock overview
  │     ├── transactions.js      receive, consume, transfer, adjust
  │     ├── cartons.js           carton type CRUD
  │     ├── locations.js         location CRUD
  │     ├── alerts.js            threshold management
  │     ├── push.js              Web Push subscription management
  │     └── reports.js           cost, savings, history, trends
  ├── services/
  │     ├── inventory.js         apply transactions, update lots atomically
  │     ├── alerts.js            threshold evaluation, email + push dispatch
  │     └── reports.js           aggregation queries
  ├── db/
  │     ├── client.js            Turso libSQL client
  │     └── migrations/          versioned SQL files
  ├── views/                     Eta templates
  │     ├── layouts/
  │     ├── pages/
  │     └── partials/
  ├── public/
  │     ├── sw.js                Service worker (push)
  │     └── components/          Compiled Web Component JS
  └── components/                Web Component source (JavaScript + JSDoc)
        ├── barcode-scanner.js
        ├── stock-chart.js
        └── push-subscribe.js
```

---

## Key Pages

| Route | Description |
|---|---|
| `GET /` | Dashboard — stock levels, low-stock banners, savings summary |
| `GET /locations/:id` | Single-location stock detail |
| `GET /transactions/receive` | Receive stock form |
| `GET /transactions/consume` | Consume stock form |
| `GET /transactions/transfer` | Transfer form (source → destination) |
| `GET /transactions` | Full transaction history |
| `GET /cartons` | Carton type list |
| `GET /cartons/new` | Add a carton type |
| `GET /cartons/:id/edit` | Edit carton type (name, SKU, cost, barcode, dimensions) |
| `GET /alerts` | Alert threshold configuration |
| `GET /reports` | Cost, savings, and consumption reporting |
| `GET /settings` | User profile, notification preferences, push subscription |
| `GET /admin/users` | User management (admin only) |

---

## Mobile UX Considerations

Staff log activity on personal phones. Every form must work as a one-handed, thumb-first interaction:

- Touch targets ≥ 44×44px
- Barcode scan as the primary carton-selection method (not searching a dropdown)
- Quantity input uses `inputmode="numeric"` — numeric keyboard on mobile
- Forms are single-page, minimal scrolling — progressive disclosure for optional fields
- Datastar SSE confirms submission in-place without a full page reload

---

## Non-Functional Requirements

- **Audit trail**: transactions are append-only — no DELETE or UPDATE on the transactions table
- **Consistency**: InventoryLot updates and transaction inserts happen in a single libSQL transaction
- **Security**: parameterized queries throughout, CSRF tokens on all mutations, role middleware on every route
- **Accessibility**: semantic HTML, ARIA where Web Components require it, no color-only indicators
- **Offline**: service worker caches the app shell; pending submits are queued and replayed on reconnect (stretch goal)

---

## Out of Scope (v1)

- Purchase order management or supplier integration
- Barcode label printing
- Native mobile app
- Webhook / Slack notifications
- Weight / volume tracking beyond outer dimensions
- Multi-tenant SaaS (single deployment, single org)
