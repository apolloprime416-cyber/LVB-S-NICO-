import { Router, type IRouter, raw } from "express";
import bcrypt from "bcryptjs";
import { and, eq, desc, gt, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  licenseKeysTable,
  extensionFilesTable,
  promotionsTable,
  planPricesTable,
} from "@workspace/db";
import {
  GetUsersQueryParams,
  SetUserPasswordBody,
  GetKeysQueryParams,
  GenerateKeysBody,
  CreateManagerBody,
  CreatePromotionBody,
  SetPlanPriceBody,
} from "@workspace/api-zod";
import { requireAdmin, requireStaff } from "../middlewares/auth";
import { serializeUser } from "../lib/users";
import { trimToZip } from "../lib/zip";
import {
  serializeKey,
  computeStatus,
  generateKeyCode,
  isValidPlan,
  type Plan,
} from "../lib/keys";

const router: IRouter = Router();

// Admin-only areas: manager accounts and promotions/pricing.
router.use("/admin/managers", requireAdmin);
router.use("/admin/promotions", requireAdmin);
router.use("/admin/plans", requireAdmin);
// Everything else under /admin is shared between admin and managers.
router.use("/admin", requireStaff);

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

// Admin-only: promote a client to manager
router.post("/admin/users/:id/promote", async (req, res): Promise<void> => {
  const id = paramId(req);
  const [updated] = await db
    .update(usersTable)
    .set({ role: "manager", status: "approved" })
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "client")))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Usuário não encontrado ou não é cliente" });
    return;
  }
  res.json(serializeUser(updated, 0));
});

// Admin-only: demote a manager back to client
router.post("/admin/users/:id/demote", requireAdmin, async (req, res): Promise<void> => {
  const id = paramId(req);
  const [updated] = await db
    .update(usersTable)
    .set({ role: "client", canCreateKeys: false })
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "manager")))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Gerente não encontrado" });
    return;
  }
  res.json(serializeUser(updated, 0));
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
  if (statusFilter && statusFilter !== "expired") {
    conditions.push(eq(licenseKeysTable.status, statusFilter));
  }

  // Managers without canCreateKeys permission only see keys THEY created.
  // Managers with canCreateKeys (or admins) see all keys.
  if (req.currentUser!.role === "manager") {
    const [mgr] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.currentUser!.id));
    if (!mgr?.canCreateKeys) {
      conditions.push(eq(licenseKeysTable.createdById, req.currentUser!.id));
    }
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

  // Managers: check canCreateKeys permission for paid plans.
  // Without it, only "trial" keys are allowed.
  if (req.currentUser!.role === "manager") {
    const PAID_PLANS = ["daily", "weekly", "monthly", "lifetime"];
    if (PAID_PLANS.includes(plan)) {
      const [mgr] = await db.select().from(usersTable).where(eq(usersTable.id, req.currentUser!.id));
      if (!mgr?.canCreateKeys) {
        res.status(403).json({
          error: "Permissão de gerar keys pagas não habilitada. Você só pode gerar keys de teste.",
        });
        return;
      }
    }
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

  // Always track who created the key so managers can filter their own
  const createdById = req.currentUser!.id;

  const values = Array.from({ length: quantity }, () => ({
    code: generateKeyCode(),
    plan,
    status: "inactive" as const,
    userId,
    userEmail,
    createdById,
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

// Transfer a key to a specific user (admin only)
router.post("/admin/keys/:id/transfer", requireAdmin, async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    res.status(400).json({ error: "E-mail é obrigatório" });
    return;
  }

  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!target) {
    res.status(404).json({ error: "E-mail não encontrado no sistema" });
    return;
  }
  if (target.status !== "approved") {
    res.status(400).json({ error: "Usuário não está aprovado" });
    return;
  }

  const [updated] = await db
    .update(licenseKeysTable)
    .set({ userId: target.id, userEmail: target.email })
    .where(eq(licenseKeysTable.id, paramId(req)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Key não encontrada" });
    return;
  }

  res.json(serializeKey(updated));
});

// --- Manager accounts (admin only, enforced by requireAdmin above) ---

router.get("/admin/managers", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "manager"))
    .orderBy(desc(usersTable.createdAt));
  res.json(rows.map((u) => serializeUser(u, 0)));
});

router.post("/admin/managers", async (req, res): Promise<void> => {
  const parsed = CreateManagerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Preencha nome, e-mail e senha (mínimo 6 caracteres)" });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (existing) {
    res.status(400).json({ error: "Este e-mail já está cadastrado" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const [created] = await db
    .insert(usersTable)
    .values({
      name: parsed.data.name.trim(),
      email,
      passwordHash,
      role: "manager",
      status: "approved",
    })
    .returning();
  res.status(201).json(serializeUser(created!, 0));
});

// Toggle canCreateKeys permission for a manager
router.patch("/admin/managers/:id/permissions", async (req, res): Promise<void> => {
  const { canCreateKeys } = req.body as { canCreateKeys?: boolean };
  if (typeof canCreateKeys !== "boolean") {
    res.status(400).json({ error: "Campo canCreateKeys deve ser boolean" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ canCreateKeys })
    .where(and(eq(usersTable.id, paramId(req)), eq(usersTable.role, "manager")))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Gerente não encontrado" });
    return;
  }
  res.json({ ok: true, canCreateKeys: updated.canCreateKeys });
});

router.delete("/admin/managers/:id", async (req, res): Promise<void> => {
  const [deleted] = await db
    .delete(usersTable)
    .where(
      and(eq(usersTable.id, paramId(req)), eq(usersTable.role, "manager")),
    )
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Gerente não encontrado" });
    return;
  }
  res.json({ ok: true });
});

// --- Promotions and plan prices (admin only) ---

router.get("/admin/promotions", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(promotionsTable)
    .orderBy(desc(promotionsTable.createdAt));
  const now = Date.now();
  res.json(
    rows.map((p) => ({
      id: p.id,
      plan: p.plan,
      priceCents: p.priceCents,
      bannerText: p.bannerText ?? null,
      endsAt: p.endsAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
      active: p.endsAt.getTime() > now,
    })),
  );
});

router.post("/admin/promotions", async (req, res): Promise<void> => {
  const parsed = CreatePromotionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados da promoção inválidos" });
    return;
  }
  const { plan, priceCents, durationHours } = parsed.data;
  const endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);
  const bannerText =
    typeof parsed.data.bannerText === "string" && parsed.data.bannerText.trim()
      ? parsed.data.bannerText.trim().slice(0, 200)
      : null;
  // Only one active promotion per plan: replace any still-active one.
  const [created] = await db.transaction(async (tx) => {
    await tx
      .delete(promotionsTable)
      .where(
        and(eq(promotionsTable.plan, plan), gt(promotionsTable.endsAt, new Date())),
      );
    return tx
      .insert(promotionsTable)
      .values({ plan, priceCents, bannerText, endsAt })
      .returning();
  });
  res.status(201).json({
    id: created!.id,
    plan: created!.plan,
    priceCents: created!.priceCents,
    bannerText: created!.bannerText ?? null,
    endsAt: created!.endsAt.toISOString(),
    createdAt: created!.createdAt.toISOString(),
    active: true,
  });
});

router.delete("/admin/promotions/:id", async (req, res): Promise<void> => {
  const [deleted] = await db
    .delete(promotionsTable)
    .where(eq(promotionsTable.id, paramId(req)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Promoção não encontrada" });
    return;
  }
  res.json({ ok: true });
});

router.put("/admin/plans/:plan/price", async (req, res): Promise<void> => {
  const plan = Array.isArray(req.params.plan)
    ? req.params.plan[0]
    : req.params.plan;
  if (!["daily", "weekly", "monthly", "lifetime"].includes(plan)) {
    res.status(400).json({ error: "Plano inválido" });
    return;
  }
  const parsed = SetPlanPriceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Preço inválido (mínimo R$ 0,50)" });
    return;
  }
  await db
    .insert(planPricesTable)
    .values({ plan, priceCents: parsed.data.priceCents })
    .onConflictDoUpdate({
      target: planPricesTable.plan,
      set: { priceCents: parsed.data.priceCents, updatedAt: new Date() },
    });
  res.json({ ok: true });
});

// --- Extension file management ---

router.get("/admin/extension", async (_req, res): Promise<void> => {
  const [file] = await db
    .select({
      filename: extensionFilesTable.filename,
      size: extensionFilesTable.size,
      updatedAt: extensionFilesTable.updatedAt,
    })
    .from(extensionFilesTable)
    .limit(1);
  if (!file) {
    res.json({ available: false, filename: null, size: null, updatedAt: null });
    return;
  }
  res.json({
    available: true,
    filename: file.filename,
    size: file.size,
    updatedAt: file.updatedAt.toISOString(),
  });
});

router.get(
  "/admin/extension/download",
  async (_req, res): Promise<void> => {
    const [file] = await db.select().from(extensionFilesTable).limit(1);
    if (!file) {
      res.status(404).json({ error: "Nenhum arquivo disponível" });
      return;
    }
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="LVB Sonico.zip"; filename*=UTF-8''LVB%20S%C3%B4nico.zip`,
    );
    res.send(trimToZip(Buffer.from(file.data)));
  },
);

// Upload/replace the extension zip. Body is the raw zip bytes; the
// filename comes via the X-Filename header (or ?filename=).
router.put(
  "/admin/extension",
  requireAdmin, // publishing the extension zip is admin-only (managers can only download)
  raw({ type: () => true, limit: "50mb" }),
  async (req, res): Promise<void> => {
    let body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "Arquivo vazio" });
      return;
    }
    body = trimToZip(body);
    const rawName =
      (req.header("x-filename") ?? String(req.query.filename ?? "")).trim() ||
      "extensao.zip";
    const filename = rawName.replace(/[^\w.\- ()]/g, "_");

    // Single-row table: replace any existing file.
    await db.delete(extensionFilesTable);
    const [created] = await db
      .insert(extensionFilesTable)
      .values({ filename, size: body.length, data: body })
      .returning({
        filename: extensionFilesTable.filename,
        size: extensionFilesTable.size,
        updatedAt: extensionFilesTable.updatedAt,
      });
    res.status(201).json({
      available: true,
      filename: created.filename,
      size: created.size,
      updatedAt: created.updatedAt.toISOString(),
    });
  },
);

export default router;
