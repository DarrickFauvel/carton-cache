import { Store } from "express-session";
import { db } from "../db/client.js";

export class TursoSessionStore extends Store {
  /** @type {ReturnType<typeof setInterval>} */
  #pruneInterval;

  constructor(pruneIntervalMs = 15 * 60 * 1000) {
    super();
    // Periodically remove expired sessions
    this.#pruneInterval = setInterval(() => this.#prune(), pruneIntervalMs);
    if (this.#pruneInterval.unref) this.#pruneInterval.unref();
  }

  async #prune() {
    await db.execute({
      sql: "DELETE FROM sessions WHERE expires <= ?",
      args: [Math.floor(Date.now() / 1000)],
    });
  }

  /**
   * @param {string} sid
   * @param {(err: unknown, session?: import("express-session").SessionData | null) => void} callback
   */
  get(sid, callback) {
    db.execute({ sql: "SELECT data, expires FROM sessions WHERE sid = ?", args: [sid] })
      .then((res) => {
        const row = res.rows[0];
        if (!row) return callback(null, null);
        if (/** @type {number} */ (row.expires) <= Math.floor(Date.now() / 1000)) {
          this.destroy(sid, () => callback(null, null));
          return;
        }
        callback(null, JSON.parse(/** @type {string} */ (row.data)));
      })
      .catch(callback);
  }

  /**
   * @param {string} sid
   * @param {import("express-session").SessionData} session
   * @param {(err?: unknown) => void} [callback]
   */
  set(sid, session, callback) {
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

  /**
   * @param {string} sid
   * @param {(err?: unknown) => void} [callback]
   */
  destroy(sid, callback) {
    db.execute({ sql: "DELETE FROM sessions WHERE sid = ?", args: [sid] })
      .then(() => callback?.())
      .catch(callback);
  }

  /**
   * @param {string} sid
   * @param {import("express-session").SessionData} session
   * @param {(err?: unknown) => void} [callback]
   */
  touch(sid, session, callback) {
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
