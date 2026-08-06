import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, type UserRow } from "@workspace/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: UserRow;
    }
  }
}

async function loadUser(req: Request): Promise<UserRow | null> {
  const userId = req.session.userId;
  if (!userId) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user ?? null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await loadUser(req);
  if (!user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  req.currentUser = user;
  next();
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await loadUser(req);
  if (!user || user.role !== "admin") {
    res.status(401).json({ error: "Acesso restrito ao administrador" });
    return;
  }
  req.currentUser = user;
  next();
}

/** Admin or manager: shared staff area (users, keys, approvals). */
export async function requireStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await loadUser(req);
  if (!user || (user.role !== "admin" && user.role !== "manager")) {
    res.status(401).json({ error: "Acesso restrito à equipe" });
    return;
  }
  req.currentUser = user;
  next();
}

export async function requireClient(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await loadUser(req);
  if (!user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (user.status !== "approved") {
    res.status(403).json({ error: "Conta aguardando aprovação" });
    return;
  }
  req.currentUser = user;
  next();
}
