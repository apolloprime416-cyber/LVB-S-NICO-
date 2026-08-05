import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { and, eq, desc, sql } from "drizzle-orm";
import { db, usersTable, licenseKeysTable } from "@workspace/db";
import {
  GetUsersQueryParams,
  SetUserPasswordBody,
  GetKeysQueryParams,
  GenerateKeysBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import { serializeUser } from "../lib/users";
import {
  serializeKey,
  computeStatus,
  generateKeyCode,
  isValidPlan,
  type Plan,
} from "../lib/keys";

const router: IRouter = Router();

router.use("/admin", requireAdmin);

function paramId(req: { params: Record<string, string | string[]> }): string {
  const raw = req.params.id;
  return Array.isArray(raw) ? raw[0] : raw;
}

router.get("/admin/stats", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable);
  const keys = await db.select().from(licenseKeysTable);

  const planCounts = { trial: 0, daily: 0, weekly: 0, monthly: 0, lifetime: 0 };
  let activeKeys = 0;
  let inactiveKeys = 0;
  let expiredKeys = 0;
  let revokedKeys = 0;
  for (const k of keys) {
    if (k.plan in planCounts) {
      planCounts[k.plan as Plan] += 1;
    }
    const status = computeStatus(k);
    if (status === "active") activeKeys += 1;
    else if (status === "inactive") inactiveKeys += 1;
    else if (status === "expired") expiredKeys += 1;
    else if (status === "revoked") revokedKeys += 1;
  }

  const clients = users.filter((u) => u.role === "client");

  res.json({
    totalUsers: clients.length,
    pendingUsers: clients.filter((u) => u.status === "pending").length,
    approvedUsers: clients.filter((u) => u.status === "approved").length,
    totalKeys: keys.length,
    activeKeys,
    inactiveKeys,
    expiredKeys,
    revokedKeys,
    planCounts,
  });
});

router.get("/admin/users", async (req, res): Promise<void> => {
  const parsed = GetUsersQueryParams.safeParse(req.query);
  const statusFilter = parsed.success ? parsed.data.status : undefined;

  const rows = statusFilter
    ? await db
        .select()
        .from(usersTable)
        .where(
          and(eq(usersTable.role, "client"), eq(usersTable.status, statusFilter)),
        )
        .orderBy(desc(usersTable.createdAt))
    : await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.role, "client"))
        .orderBy(desc(usersTable.createdAt));

  const counts = await db
    .select({
      userId: licenseKeysTable.userId,
      count: sql<number>`count(*)::int`,
    })
    .from(licenseKeysTable)
    .groupBy(licenseKeysTable.userId);
  const countMap = new Map(counts.map((c) => [c.userId, c.count]));

  res.json(rows.map((u) => serializeUser(u, countMap.get(u.id) ?? 0)));
});

router.post("/admin/users/:id/approve", async (req, res): Promise<void> => {
  const [updated] = await db
    .update(usersTable)
    .set({ status: "approved" })
    .where(and(eq(usersTable.id, paramId(req)), eq(usersTable.role, "client")))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }
  res.json(serializeUser(updated, 0));
});

router.post("/admin/users/:id/reject", async (req, res): Promise<void> => {
  const [updated] = await db
    .update(usersTable)
    .set({ status: "rejected" })
    .where(and(eq(usersTable.id, paramId(req)), eq(usersTable.role, "client")))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }
  res.json(serializeUser(updated, 0));
});

router.post("/admin/users/:id/password", async (req, res): Promise<void> => {
  const parsed = SetUserPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash })
    .where(and(eq(usersTable.id, paramId(req)), eq(usersTable.role, "client")))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }
  res.json({ ok: true });
});

router.delete("/admin/users/:id", async (req, res): Promise<void> => {
  const id = paramId(req);
  await db.delete(licenseKeysTable).where(eq(licenseKeysTable.userId, id));
  const [deleted] = await db
    .delete(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "client")))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }
  res.json({ ok: true });
});

router.get("/admin/keys", async (req, res): Promise<void> => {
  const parsed = GetKeysQueryParams.safeParse(req.query);
  const planFilter = parsed.success ? parsed.data.plan : undefined;
  const statusFilter = parsed.success ? parsed.data.status : undefined;

  const conditions = [];
  if (planFilter) conditions.push(eq(licenseKeysTable.plan, planFilter));
  // status is computed for expired; filter inactive/active/revoked directly,
  // and filter expired in-memory below.
  if (statusFilter && statusFilter !== "expired") {
    conditions.push(eq(licenseKeysTable.status, statusFilter));
  }

  let rows = await db
    .select()
    .from(licenseKeysTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(licenseKeysTable.createdAt));

  if (statusFilter) {
    rows = rows.filter((r) => computeStatus(r) === statusFilter);
  }

  res.json(rows.map(serializeKey));
});

router.post("/admin/keys", async (req, res): Promise<void> => {
  const parsed = GenerateKeysBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { plan, quantity } = parsed.data;
  if (!isValidPlan(plan)) {
    res.status(400).json({ error: "Plano inválido" });
    return;
  }

  let userId: string | null = null;
  let userEmail: string | null = null;
  if (parsed.data.userEmail) {
    const email = parsed.data.userEmail.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));
    if (!user) {
      res.status(400).json({ error: "Nenhum usuário com este e-mail" });
      return;
    }
    userId = user.id;
    userEmail = user.email;
  }

  const values = Array.from({ length: quantity }, () => ({
    code: generateKeyCode(),
    plan,
    status: "inactive" as const,
    userId,
    userEmail,
  }));

  const created = await db.insert(licenseKeysTable).values(values).returning();
  res.status(201).json(created.map(serializeKey));
});

router.post("/admin/keys/:id/revoke", async (req, res): Promise<void> => {
  const [updated] = await db
    .update(licenseKeysTable)
    .set({ status: "revoked" })
    .where(eq(licenseKeysTable.id, paramId(req)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Key não encontrada" });
    return;
  }
  res.json(serializeKey(updated));
});

router.post("/admin/keys/:id/reset-device", async (req, res): Promise<void> => {
  const [updated] = await db
    .update(licenseKeysTable)
    .set({ deviceFingerprint: null })
    .where(eq(licenseKeysTable.id, paramId(req)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Key não encontrada" });
    return;
  }
  res.json(serializeKey(updated));
});

router.delete("/admin/keys/:id", async (req, res): Promise<void> => {
  const [deleted] = await db
    .delete(licenseKeysTable)
    .where(eq(licenseKeysTable.id, paramId(req)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Key não encontrada" });
    return;
  }
  res.json({ ok: true });
});

export default router;
