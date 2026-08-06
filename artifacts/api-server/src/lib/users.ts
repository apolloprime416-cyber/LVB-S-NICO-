import type { UserRow } from "@workspace/db";

export function serializeSessionUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    // Included for managers so the frontend can restrict the plan selector
    canCreateKeys: row.role === "manager" ? (row.canCreateKeys ?? false) : undefined,
  };
}

export function serializeUser(row: UserRow, keyCount: number) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    keyCount,
    createdAt: row.createdAt.toISOString(),
    // Included for managers so the toggle in the admin panel reflects the real state
    canCreateKeys: row.role === "manager" ? (row.canCreateKeys ?? false) : undefined,
  };
}
