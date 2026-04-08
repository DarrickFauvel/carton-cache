import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import { TursoSessionStore } from "./lib/session-store.js";
import cookieParser from "cookie-parser";
import { Eta } from "eta";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { locals } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import dashboardRouter from "./routes/dashboard.js";
import transactionsRouter from "./routes/transactions.js";
import cartonsRouter from "./routes/cartons.js";
import locationsRouter from "./routes/locations.js";
import alertsRouter from "./routes/alerts.js";
import pushRouter from "./routes/push.js";
import reportsRouter from "./routes/reports.js";
import usersRouter from "./routes/users.js";
import profileRouter from "./routes/profile.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // ── View engine ──────────────────────────────────────────────────────────────
  // src/views is always present (git repo); avoids copying .eta files to dist/
  const viewsDir = join(process.cwd(), "src", "views");
  const eta = new Eta({ views: viewsDir, cache: process.env.NODE_ENV === "production" });
  app.engine("eta", (path, data, cb) => {
    // Express resolves to an absolute path; strip the views dir so Eta doesn't double it
    const rel = path.startsWith(viewsDir) ? path.slice(viewsDir.length) : path;
    eta
      .renderAsync(rel, data as Record<string, unknown>)
      .then((html: string) => cb(null, html))
      .catch(cb);
  });
  app.set("view engine", "eta");
  app.set("views", join(__dirname, "views"));

  // ── Middleware ───────────────────────────────────────────────────────────────
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    session({
      store: new TursoSessionStore(),
      secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );
  app.use(locals); // attach user to res.locals

  // ── Static files ─────────────────────────────────────────────────────────────
  app.use(express.static(join(__dirname, "..", "public")));

  // ── Routes ───────────────────────────────────────────────────────────────────
  app.use("/", authRouter);
  app.use("/", dashboardRouter);
  app.use("/transactions", transactionsRouter);
  app.use("/cartons", cartonsRouter);
  app.use("/locations", locationsRouter);
  app.use("/alerts", alertsRouter);
  app.use("/push", pushRouter);
  app.use("/reports", reportsRouter);
  app.use("/", usersRouter);
  app.use("/", profileRouter);

  // ── 404 ──────────────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).render("pages/error", {
      title: "Not Found",
      message: "Page not found.",
    });
  });

  // ── 500 ──────────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).render("pages/error", {
      title: "Server Error",
      message: process.env.NODE_ENV === "production" ? "Something went wrong." : err.message,
    });
  });

  return app;
}
