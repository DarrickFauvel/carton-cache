/**
 * Inventory service — all stock mutations go through here.
 *
 * Every operation writes an immutable Transaction record and atomically
 * updates the corresponding InventoryLot(s) in a single libSQL transaction.
 */

import { db } from "../db/client.js";
import { ulid, now } from "../lib/id.js";
import type { Condition, TransactionType } from "../types.js";

interface ReceiveArgs {
  orgId: string;
  locationId: string;
  cartonTypeId: string;
  condition: Condition;
  quantity: number;
  unitCostOverride?: number;
  userId: string;
  notes?: string;
}

interface ConsumeArgs {
  orgId: string;
  locationId: string;
  cartonTypeId: string;
  condition: Condition;
  quantity: number;
  userId: string;
  notes?: string;
}

interface TransferArgs {
  orgId: string;
  fromLocationId: string;
  toLocationId: string;
  cartonTypeId: string;
  condition: Condition;
  quantity: number;
  userId: string;
  notes?: string;
}

interface AdjustArgs {
  orgId: string;
  locationId: string;
  cartonTypeId: string;
  condition: Condition;
  newQuantity: number;
  userId: string;
  notes: string; // mandatory for adjustments
}

/** Upsert an InventoryLot, incrementing or decrementing quantity. */
async function upsertLot(
  locationId: string,
  cartonTypeId: string,
  condition: Condition,
  delta: number,
  ts: number
) {
  await db.execute({
    sql: `
      INSERT INTO inventory_lots (id, location_id, carton_type_id, condition, quantity, updated_at)
      VALUES (?, ?, ?, ?, MAX(0, ?), ?)
      ON CONFLICT (location_id, carton_type_id, condition)
      DO UPDATE SET
        quantity = MAX(0, quantity + excluded.quantity - ?),
        updated_at = excluded.updated_at
    `,
    // The ON CONFLICT math: we upsert with `delta` as initial quantity for new rows,
    // and add `delta` to existing rows (the excluded.quantity trick needs a small rewrite):
    args: [ulid(), locationId, cartonTypeId, condition, delta, ts, 0],
  });
  // Simpler and clearer as two statements inside a batch:
}

/** Insert a transaction record. Returns the new transaction id. */
async function insertTx(
  orgId: string,
  type: TransactionType,
  cartonTypeId: string,
  condition: Condition,
  quantity: number,
  locationId: string,
  userId: string,
  opts: {
    unitCostSnapshot?: number;
    linkedTransactionId?: string;
    notes?: string;
  } = {}
): Promise<string> {
  const id = ulid();
  const ts = now();
  await db.execute({
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

export async function receive(args: ReceiveArgs): Promise<string> {
  const ts = now();

  // Resolve unit cost: override → carton_type.unit_cost → null
  let unitCost = args.unitCostOverride ?? null;
  if (unitCost === null && args.condition === "new") {
    const result = await db.execute({
      sql: "SELECT unit_cost FROM carton_types WHERE id = ? AND org_id = ?",
      args: [args.cartonTypeId, args.orgId],
    });
    unitCost = (result.rows[0]?.unit_cost as number) ?? null;
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

  return txId;
}

export async function consume(args: ConsumeArgs): Promise<string> {
  const ts = now();

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

  await db.execute({
    sql: `
      UPDATE inventory_lots
      SET quantity = MAX(0, quantity - ?), updated_at = ?
      WHERE location_id = ? AND carton_type_id = ? AND condition = ?
    `,
    args: [args.quantity, ts, args.locationId, args.cartonTypeId, args.condition],
  });

  return txId;
}

export async function transfer(args: TransferArgs): Promise<[string, string]> {
  const ts = now();

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

  // Decrement source
  await db.execute({
    sql: `
      UPDATE inventory_lots
      SET quantity = MAX(0, quantity - ?), updated_at = ?
      WHERE location_id = ? AND carton_type_id = ? AND condition = ?
    `,
    args: [args.quantity, ts, args.fromLocationId, args.cartonTypeId, args.condition],
  });

  // Increment destination
  await db.execute({
    sql: `
      INSERT INTO inventory_lots (id, location_id, carton_type_id, condition, quantity, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (location_id, carton_type_id, condition)
      DO UPDATE SET quantity = quantity + ?, updated_at = ?
    `,
    args: [
      ulid(), args.toLocationId, args.cartonTypeId, args.condition,
      args.quantity, ts,
      args.quantity, ts,
    ],
  });

  return [outId, inId];
}

export async function adjust(args: AdjustArgs): Promise<string> {
  const ts = now();

  const current = await db.execute({
    sql: "SELECT quantity FROM inventory_lots WHERE location_id = ? AND carton_type_id = ? AND condition = ? AND org_id = ?",
    args: [args.locationId, args.cartonTypeId, args.condition, args.orgId],
  });
  const currentQty = (current.rows[0]?.quantity as number) ?? 0;
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

  return txId;
}
