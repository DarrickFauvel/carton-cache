# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Carton Cache is a Next.js 14 web app for managing shipping carton inventory. It supports adding/editing/deleting cartons, searching for cartons that can fit items of given dimensions (with 6-rotation permutation matching), and toggling between centimeter and inch units.

## Development Commands

```bash
# Initial setup
cp .env.example .env
npm install
npx prisma generate
npx prisma db push

# Development
npm run dev          # Start dev server at http://localhost:3000

# Production
npm run build
npm run start

# Database
npm run prisma:generate   # Regenerate Prisma client after schema changes
npm run prisma:push       # Push schema changes to SQLite database

# Reset database
rm prisma/dev.db && npx prisma db push
```

No test runner is configured in this project.

## Architecture

**Framework**: Next.js 14 App Router, React 18, Prisma 4 with SQLite, no TypeScript.

**Key paths**:
- [app/page.js](app/page.js) — Single client component containing the entire UI (~278 lines)
- [app/api/cartons/route.js](app/api/cartons/route.js) — `GET /api/cartons`, `POST /api/cartons`
- [app/api/cartons/[id]/route.js](app/api/cartons/[id]/route.js) — `GET`, `PUT`, `DELETE /api/cartons/:id`
- [lib/prisma.js](lib/prisma.js) — Prisma singleton (handles dev hot-reload)
- [prisma/schema.prisma](prisma/schema.prisma) — Database schema

**Data model**: `Carton` has `id`, `length`, `width`, `height` (all `Float`, stored in centimeters), `material` (`String`), `condition` (`String`), `quantity` (`Int`), `notes` (`String?`), `createdAt`.

**Unit handling**: All dimensions are stored in centimeters. The UI converts to/from inches (`× 2.54` / `÷ 2.54`) on the client side. User's unit preference is persisted in `localStorage`.

**Carton fitting algorithm**: When searching for cartons that fit an item, 1 inch of padding is added to each dimension of the item, then all 6 axis-aligned rotations of each carton are tested against the padded item dimensions.

## Path Aliases

`@/*` maps to the project root (e.g., `@/lib/prisma`), configured in [jsconfig.json](jsconfig.json).

## Environment

Requires a `.env` file with:
```
DATABASE_URL="file:./dev.db"
```
The SQLite database file is created at the path specified in `DATABASE_URL` relative to the `prisma/` directory by default.
