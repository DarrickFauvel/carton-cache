# Carton Cache — Development Setup


1. Copy the example env and install dependencies:

```bash
cp .env.example .env
npm install
```

2. Generate Prisma client and push schema to SQLite:

```bash
npx prisma generate
npx prisma db push
```

3. Run the dev server:

```bash
npm run dev
```

Open http://localhost:3000 to view the app. This project uses the Next.js App Router (`/app`) and App Router API route handlers under `/app/api`.

Notes:
- The default SQLite DB file will be `dev.db` next to the project root when using `DATABASE_URL="file:./dev.db"`.
- To reset the DB, remove `dev.db` and run `npx prisma db push` again.
