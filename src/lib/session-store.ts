import { Store, SessionData } from "express-session";
import { db } from "../db/client.js";

export class TursoSessionStore extends Store {
  private pruneInterval: ReturnType<typeof setInterval>;

  constructor(pruneIntervalMs = 15 * 60 * 1000) {
    super();
    // Periodically remove expired sessions
    this.pruneInterval = setInterval(() => this.prune(), pruneIntervalMs);
    if (this.pruneInterval.unref) this.pruneInterval.unref();
  }

  private async prune() {
    await db.execute({
      sql: "DELETE FROM sessions WHERE expires <= ?",
      args: [Math.floor(Date.now() / 1000)],
    });
  }

  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void) {
    db.execute({ sql: "SELECT data, expires FROM sessions WHERE sid = ?", args: [sid] })
      .then((res) => {
        const row = res.rows[0];
        if (!row) return callback(null, null);
        if ((row.expires as number) <= Math.floor(Date.now() / 1000)) {
          this.destroy(sid, () => callback(null, null));
          return;
        }
        callback(null, JSON.parse(row.data as string));
      })
      .catch(callback);
  }

  set(sid: string, session: SessionData, callback?: (err?: unknown) => void) {
    const expires = session.cookie?.expires
      ? Math.floor(new Date(session.cookie.expires).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    db.execute({
      sql: `INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
            ON CONFLICT (sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`,
      args: [sid, JSON.stringify(session), expires],
    })
      .then(() => callback?.())
      .catch(callback);
  }

  destroy(sid: string, callback?: (err?: unknown) => void) {
    db.execute({ sql: "DELETE FROM sessions WHERE sid = ?", args: [sid] })
      .then(() => callback?.())
      .catch(callback);
  }

  touch(sid: string, session: SessionData, callback?: (err?: unknown) => void) {
    const expires = session.cookie?.expires
      ? Math.floor(new Date(session.cookie.expires).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    db.execute({
      sql: "UPDATE sessions SET expires = ? WHERE sid = ?",
      args: [expires, sid],
    })
      .then(() => callback?.())
      .catch(callback);
  }
}
