/**
 * Inventory service — all stock mutations go through here.
 *
 * Every operation writes an immutable Transaction record and atomically
 * updates the corresponding InventoryLot(s) in a single libSQL transaction.
 */

import { db } from "../db/client.js";
import { ulid, now } from "../lib/id.js";

/** @typedef {import("../types.js").Condition} Condition */
/** @typedef {import("../types.js").TransactionType} TransactionType */
/** @typedef {import("@libsql/client").Client | import("@libsql/client").Transaction} Executor */

/**
 * @typedef {object} ReceiveArgs
 * @property {string} orgId
 * @property {string} locationId
 * @property {string} cartonTypeId
 * @property {Condition} condition
 * @property {number} quantity
 * @property {number} [unitCostOverride]
 * @property {string} userId
 * @property {string} [notes]
 */

/**
 * @typedef {object} ConsumeArgs
 * @property {string} orgId
 * @property {string} locationId
 * @property {string} cartonTypeId
 * @property {Condition} condition
 * @property {number} quantity
 * @property {string} userId
 * @property {string} [notes]
 */

/**
 * @typedef {object} TransferArgs
 * @property {string} orgId
 * @property {string} fromLocationId
 * @property {string} toLocationId
 * @property {string} cartonTypeId
 * @property {Condition} condition
 * @property {number} quantity
 * @property {string} userId
 * @property {string} [notes]
 */

/**
 * @typedef {object} TransferLine
 * @property {string} cartonTypeId
 * @property {Condition} condition
 * @property {number} quantity
 */

/**
 * @typedef {object} TransferManyArgs
 * @property {string} orgId
 * @property {string} fromLocationId
 * @property {string} toLocationId
 * @property {TransferLine[]} lines
 * @property {string} userId
 * @property {string} [notes]
 */

/**
 * @typedef {object} AdjustArgs
 * @property {string} orgId
 * @property {string} locationId
 * @property {string} cartonTypeId
 * @property {Condition} condition
 * @property {number} newQuantity
 * @property {string} userId
 * @property {string} notes mandatory for adjustments
 */

/**
 * Insert a transaction record. Returns the new transaction id.
 * @param {string} orgId
 * @param {TransactionType} type
 * @param {string} cartonTypeId
 * @param {Condition} condition
 * @param {number} quantity
 * @param {string} locationId
 * @param {string} userId
 * @param {{ unitCostSnapshot?: number; linkedTransactionId?: string; notes?: string; exec?: Executor }} [opts]
 *   exec: run inside this transaction instead of directly on the db
 * @returns {Promise<string>}
 */
async function insertTx(orgId, type, cartonTypeId, condition, quantity, locationId, userId, opts = {}) {
  const id = ulid();
  const ts = now();
  await (opts.exec ?? db).execute({
    sql: `
      INSERT INTO transactions
        (id, type, carton_type_id, condition, quantity, unit_cost_snapshot,
         location_id, linked_transaction_id, user_id, notes, org_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      id,
      type,
      cartonTypeId,
      condition,
      quantity,
      opts.unitCostSnapshot ?? null,
      locationId,
      opts.linkedTransactionId ?? null,
      userId,
      opts.notes ?? null,
      orgId,
      ts,
    ],
  });
  return id;
}

/**
 * @param {ReceiveArgs} args
 * @returns {Promise<string>}
 */
export async function receive(args) {
  const ts = now();

  // Resolve unit cost: override → carton_type.unit_cost → null
  let unitCost = args.unitCostOverride ?? null;
  if (unitCost === null && args.condition === "new") {
    const result = await db.execute({
      sql: "SELECT unit_cost FROM carton_types WHERE id = ? AND org_id = ?",
      args: [args.cartonTypeId, args.orgId],
    });
    unitCost = /** @type {number} */ (result.rows[0]?.unit_cost) ?? null;
  }

  const txId = await insertTx(
    args.orgId,
    "receive",
    args.cartonTypeId,
    args.condition,
    args.quantity,
    args.locationId,
    args.userId,
    { unitCostSnapshot: unitCost ?? undefined, notes: args.notes }
  );

  await db.execute({
    sql: `
      INSERT INTO inventory_lots (id, location_id, carton_type_id, condition, quantity, updated_at, org_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (location_id, carton_type_id, condition)
      DO UPDATE SET quantity = quantity + ?, updated_at = ?
    `,
    args: [
      ulid(), args.locationId, args.cartonTypeId, args.condition,
      args.quantity, ts, args.orgId,
      args.quantity, ts,
    ],
  });

  // Receiving a one-time-use carton again brings it back from the archive.
  await db.execute({
    sql: "UPDATE carton_types SET archived_at = NULL WHERE id = ? AND org_id = ? AND archived_at IS NOT NULL",
    args: [args.cartonTypeId, args.orgId],
  });

  return txId;
}

/**
 * Archive a single-use carton type once no lot anywhere in the org holds any
 * of it. A no-op for regular carton types, ones already archived, ones still
 * in stock, and ones never received (no lots, so SUM is NULL rather than 0).
 * @param {string} orgId
 * @param {string} cartonTypeId
 * @returns {Promise<void>}
 */
export async function archiveIfDepleted(orgId, cartonTypeId) {
  await db.execute({
    sql: `
      UPDATE carton_types SET archived_at = ?
      WHERE id = ? AND org_id = ? AND single_use = 1 AND archived_at IS NULL
        AND (SELECT SUM(quantity) FROM inventory_lots WHERE carton_type_id = ? AND org_id = ?) = 0
    `,
    args: [now(), cartonTypeId, orgId, cartonTypeId, orgId],
  });
}

/**
 * @param {ConsumeArgs} args
 * @returns {Promise<string>}
 * @throws {InsufficientStockError} if the lot holds fewer than `quantity`
 */
export async function consume(args) {
  const ts = now();

  // Decrement only if the lot holds enough, in one statement (see transfer()).
  // Without this, a consume whose location/condition matches no lot would
  // silently record a transaction while leaving stock untouched.
  const decremented = await db.execute({
    sql: `
      UPDATE inventory_lots
      SET quantity = quantity - ?, updated_at = ?
      WHERE location_id = ? AND carton_type_id = ? AND condition = ? AND org_id = ? AND quantity >= ?
    `,
    args: [args.quantity, ts, args.locationId, args.cartonTypeId, args.condition, args.orgId, args.quantity],
  });
  if (decremented.rowsAffected === 0) {
    const current = await db.execute({
      sql: "SELECT quantity FROM inventory_lots WHERE location_id = ? AND carton_type_id = ? AND condition = ? AND org_id = ?",
      args: [args.locationId, args.cartonTypeId, args.condition, args.orgId],
    });
    throw new InsufficientStockError(Number(current.rows[0]?.quantity ?? 0));
  }

  const txId = await insertTx(
    args.orgId,
    "consume",
    args.cartonTypeId,
    args.condition,
    args.quantity,
    args.locationId,
    args.userId,
    { notes: args.notes }
  );

  await archiveIfDepleted(args.orgId, args.cartonTypeId);

  return txId;
}

/** Thrown when a stock movement asks for more than the source lot holds. */
export class InsufficientStockError extends Error {
  /**
   * @param {number} available
   * @param {TransferLine} [line] which line of a transferMany() fell short
   */
  constructor(available, line) {
    super(`Only ${available} in stock.`);
    this.name = "InsufficientStockError";
    this.available = available;
    this.line = line;
  }
}

/**
 * @param {TransferArgs} args
 * @returns {Promise<[string, string]>}
 * @throws {InsufficientStockError} if the source lot holds fewer than `quantity`
 */
export async function transfer(args) {
  const ts = now();

  // Decrement the source first, only if it holds enough. Checking and
  // decrementing in one statement means two concurrent transfers can't both
  // pass the check and drive the lot below zero.
  const decremented = await db.execute({
    sql: `
      UPDATE inventory_lots
      SET quantity = quantity - ?, updated_at = ?
      WHERE location_id = ? AND carton_type_id = ? AND condition = ? AND org_id = ? AND quantity >= ?
    `,
    args: [args.quantity, ts, args.fromLocationId, args.cartonTypeId, args.condition, args.orgId, args.quantity],
  });
  if (decremented.rowsAffected === 0) {
    const current = await db.execute({
      sql: "SELECT quantity FROM inventory_lots WHERE location_id = ? AND carton_type_id = ? AND condition = ? AND org_id = ?",
      args: [args.fromLocationId, args.cartonTypeId, args.condition, args.orgId],
    });
    throw new InsufficientStockError(Number(current.rows[0]?.quantity ?? 0));
  }

  const outId = await insertTx(
    args.orgId,
    "transfer_out",
    args.cartonTypeId,
    args.condition,
    args.quantity,
    args.fromLocationId,
    args.userId,
    { notes: args.notes }
  );

  const inId = await insertTx(
    args.orgId,
    "transfer_in",
    args.cartonTypeId,
    args.condition,
    args.quantity,
    args.toLocationId,
    args.userId,
    { linkedTransactionId: outId, notes: args.notes }
  );

  // Backfill the link on the out record
  await db.execute({
    sql: "UPDATE transactions SET linked_transaction_id = ? WHERE id = ?",
    args: [inId, outId],
  });

  // Increment destination
  await db.execute({
    sql: `
      INSERT INTO inventory_lots (id, location_id, carton_type_id, condition, quantity, updated_at, org_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (location_id, carton_type_id, condition)
      DO UPDATE SET quantity = quantity + ?, updated_at = ?
    `,
    args: [
      ulid(), args.toLocationId, args.cartonTypeId, args.condition,
      args.quantity, ts, args.orgId,
      args.quantity, ts,
    ],
  });

  return [outId, inId];
}

/**
 * Transfers several lots from one location to another as a single unit:
 * either every line moves or none does. Each line writes its own linked
 * transfer_out/transfer_in pair, exactly as transfer() does, so history
 * stays per carton type.
 *
 * Unlike transfer(), whose statements run one by one, this uses a real
 * write transaction, since a later line failing must undo earlier ones.
 * @param {TransferManyArgs} args
 * @returns {Promise<void>}
 * @throws {InsufficientStockError} with `line` set, if any source lot holds
 *   fewer than its line asks for; nothing is moved
 */
export async function transferMany(args) {
  const ts = now();
  const tx = await db.transaction("write");
  try {
    for (const line of args.lines) {
      const decremented = await tx.execute({
        sql: `
          UPDATE inventory_lots
          SET quantity = quantity - ?, updated_at = ?
          WHERE location_id = ? AND carton_type_id = ? AND condition = ? AND org_id = ? AND quantity >= ?
        `,
        args: [line.quantity, ts, args.fromLocationId, line.cartonTypeId, line.condition, args.orgId, line.quantity],
      });
      if (decremented.rowsAffected === 0) {
        const current = await tx.execute({
          sql: "SELECT quantity FROM inventory_lots WHERE location_id = ? AND carton_type_id = ? AND condition = ? AND org_id = ?",
          args: [args.fromLocationId, line.cartonTypeId, line.condition, args.orgId],
        });
        throw new InsufficientStockError(Number(current.rows[0]?.quantity ?? 0), line);
      }

      const opts = { notes: args.notes, exec: tx };
      const outId = await insertTx(args.orgId, "transfer_out", line.cartonTypeId, line.condition, line.quantity, args.fromLocationId, args.userId, opts);
      const inId = await insertTx(args.orgId, "transfer_in", line.cartonTypeId, line.condition, line.quantity, args.toLocationId, args.userId, { ...opts, linkedTransactionId: outId });
      await tx.execute({ sql: "UPDATE transactions SET linked_transaction_id = ? WHERE id = ?", args: [inId, outId] });

      await tx.execute({
        sql: `
          INSERT INTO inventory_lots (id, location_id, carton_type_id, condition, quantity, updated_at, org_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (location_id, carton_type_id, condition)
          DO UPDATE SET quantity = quantity + ?, updated_at = ?
        `,
        args: [ulid(), args.toLocationId, line.cartonTypeId, line.condition, line.quantity, ts, args.orgId, line.quantity, ts],
      });
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  } finally {
    tx.close();
  }
}

/**
 * @param {AdjustArgs} args
 * @returns {Promise<string>}
 */
export async function adjust(args) {
  const ts = now();

  const current = await db.execute({
    sql: "SELECT quantity FROM inventory_lots WHERE location_id = ? AND carton_type_id = ? AND condition = ? AND org_id = ?",
    args: [args.locationId, args.cartonTypeId, args.condition, args.orgId],
  });
  const currentQty = /** @type {number} */ (current.rows[0]?.quantity) ?? 0;
  const delta = args.newQuantity - currentQty;
  const quantity = Math.abs(delta) || 1;

  const txId = await insertTx(
    args.orgId,
    "adjustment",
    args.cartonTypeId,
    args.condition,
    quantity,
    args.locationId,
    args.userId,
    { notes: `${delta >= 0 ? "+" : ""}${delta} — ${args.notes}` }
  );

  await db.execute({
    sql: `
      INSERT INTO inventory_lots (id, location_id, carton_type_id, condition, quantity, updated_at, org_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (location_id, carton_type_id, condition)
      DO UPDATE SET quantity = ?, updated_at = ?
    `,
    args: [
      ulid(), args.locationId, args.cartonTypeId, args.condition,
      args.newQuantity, ts, args.orgId,
      args.newQuantity, ts,
    ],
  });

  await archiveIfDepleted(args.orgId, args.cartonTypeId);

  return txId;
}
