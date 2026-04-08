// ── Domain types ──────────────────────────────────────────────────────────────

export type Role = "admin" | "manager" | "staff" | "viewer";
export type Condition = "new" | "good" | "fair" | "poor";
export type TransactionType =
  | "receive"
  | "consume"
  | "transfer_out"
  | "transfer_in"
  | "adjustment";

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  location_ids: string[]; // stored as JSON in DB
  avatar_color: string;
  org_id: string;
  created_at: number;
}

export interface Location {
  id: string;
  name: string;
  address: string | null;
  active: 1 | 0;
  created_at: number;
}

export interface CartonType {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  unit_cost: number | null;
  notes: string | null;
  created_at: number;
}

export interface InventoryLot {
  id: string;
  location_id: string;
  carton_type_id: string;
  condition: Condition;
  quantity: number;
  updated_at: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  carton_type_id: string;
  condition: Condition;
  quantity: number;
  unit_cost_snapshot: number | null;
  location_id: string;
  linked_transaction_id: string | null;
  user_id: string;
  notes: string | null;
  created_at: number;
}

export interface AlertThreshold {
  id: string;
  location_id: string;
  carton_type_id: string;
  condition: string; // Condition | 'any'
  min_quantity: number;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: number;
}

export type Plan = "free" | "pro";

export interface Organization {
  id: string;
  name: string;
  plan: Plan;
  created_at: number;
}

// ── Session augmentation ──────────────────────────────────────────────────────

declare module "express-session" {
  interface SessionData {
    userId: string;
    userRole: Role;
    userName: string;
    userLocationIds: string[];
    userAvatarColor: string;
    orgId: string;
    orgPlan: Plan;
  }
}
