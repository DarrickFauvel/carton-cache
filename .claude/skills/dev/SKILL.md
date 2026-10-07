---
name: dev
description: Start the Carton Cache dev server in the background and confirm it is serving. Use when the user wants to run the app locally.
---

Start the local dev server and confirm it's up.

1. Check whether something is already listening on the port (`PORT` from `.env`, default 3000): `curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/login`. If it answers, say the server is already running and stop.
2. If there's no `.env` file, stop and tell the user. `src/db/client.js` throws without `TURSO_DATABASE_URL`. List the variable names from `.env.example` and don't make up any values.
3. Run `npm run dev` with `run_in_background: true`. It uses `node --watch`, so it restarts on source changes.
4. After a few seconds, read the task's output file:
   - If it shows `Carton Cache running at ...`, probe `/login` and report the URL and status code.
   - If it shows a stack trace or `Failed running`, stop the background task (it would otherwise sit waiting for file changes), report the error, and suggest a fix.
5. If `.env` sets `NODE_ENV="production"`, warn the user once: the session cookie is `secure` (`src/app.js`) and the app doesn't set `trust proxy`, so login won't persist over plain http, and Eta caches templates until restart. Don't edit `.env` unless the user asks.
6. If `.env` points `TURSO_DATABASE_URL` at a remote `libsql://` database, remind the user that local actions write to that database.

If `src/components/` has changed since `public/js/components/` was last built, mention that `npm run build` is needed. The dev server doesn't bundle components.
