import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterBody, LoginBody, VerifyCodeBody } from "@workspace/api-zod";
import { serializeSessionUser } from "../lib/users";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

/** Regenerate the session to prevent fixation at privilege transitions. */
function regenerateSession(req: import("express").Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
  await db.insert(usersTable).values({
    name: parsed.data.name.trim(),
    email,
    passwordHash,
    role: "client",
    status: "pending",
  });

  res.status(201).json({ status: "pending", user: null });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!user) {
    res.status(401).json({ error: "E-mail ou senha inválidos" });
    return;
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "E-mail ou senha inválidos" });
    return;
  }

  // Admin accounts require a second-factor code.
  if (user.role === "admin" && user.twoFactorCode) {
    await regenerateSession(req);
    req.session.pendingAdminUserId = user.id;
    req.session.userId = undefined;
    res.json({ status: "code_required", user: null });
    return;
  }

  if (user.status !== "approved") {
    res.json({ status: "pending", user: null });
    return;
  }

  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.pendingAdminUserId = undefined;
  res.json({ status: "authenticated", user: serializeSessionUser(user) });
});

router.post("/auth/verify-code", async (req, res): Promise<void> => {
  const parsed = VerifyCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: "Código inválido" });
    return;
  }
  const pendingId = req.session.pendingAdminUserId;
  if (!pendingId) {
    res.status(401).json({ error: "Nenhum login pendente" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, pendingId));

  if (!user || user.role !== "admin" || !user.twoFactorCode) {
    res.status(401).json({ error: "Código inválido" });
    return;
  }

  if (parsed.data.code.trim() !== user.twoFactorCode) {
    res.status(401).json({ error: "Código inválido" });
    return;
  }

  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.pendingAdminUserId = undefined;
  res.json({ status: "authenticated", user: serializeSessionUser(user) });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  res.json(serializeSessionUser(req.currentUser!));
});

export default router;
