import type { UserRow } from "@workspace/db";

export function serializeSessionUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
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
  };
}
