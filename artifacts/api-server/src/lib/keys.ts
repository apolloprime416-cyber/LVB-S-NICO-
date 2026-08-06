import { randomBytes } from "crypto";
import type { LicenseKeyRow } from "@workspace/db";

export type Plan = "trial" | "daily" | "weekly" | "monthly" | "lifetime";
export type KeyStatus = "inactive" | "active" | "expired" | "revoked";

export const PLAN_DURATION_MINUTES: Record<Plan, number | null> = {
  trial: 15,
  daily: 60 * 24,
  weekly: 60 * 24 * 7,
  monthly: 60 * 24 * 30,
  lifetime: null,
};

export function isValidPlan(plan: string): plan is Plan {
  return plan in PLAN_DURATION_MINUTES;
}

/** Generate a unique-looking license code, e.g. LVB-4F9A-2C71-8BE0 */
export function generateKeyCode(): string {
  const raw = randomBytes(6).toString("hex").toUpperCase(); // 12 hex chars
  return `LVB-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** Compute the effective (possibly expired) status of a key for display. */
export function computeStatus(row: LicenseKeyRow): KeyStatus {
  if (row.status === "revoked") return "revoked";
  if (row.status === "active") {
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      return "expired";
    }
    return "active";
  }
  return row.status as KeyStatus;
}

/** Map a DB key row into the API Key shape. */
export function serializeKey(row: LicenseKeyRow) {
  return {
    id: row.id,
    code: row.code,
    plan: row.plan,
    status: computeStatus(row),
    userId: row.userId ?? null,
    userEmail: row.userEmail ?? null,
    deviceFingerprint: row.deviceFingerprint ?? null,
    customerName: row.customerName ?? null,
    customerEmail: row.customerEmail ?? null,
    activatedAt: row.activatedAt ? row.activatedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Given a plan, compute the expiry Date from an activation instant. */
export function computeExpiry(plan: Plan, from: Date): Date | null {
  const minutes = PLAN_DURATION_MINUTES[plan];
  if (minutes == null) return null;
  return new Date(from.getTime() + minutes * 60 * 1000);
}
