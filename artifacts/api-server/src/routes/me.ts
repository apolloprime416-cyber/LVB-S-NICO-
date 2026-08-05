import { Router, type IRouter } from "express";
import { and, eq, desc, ne, isNull } from "drizzle-orm";
import { db, licenseKeysTable } from "@workspace/db";
import { ActivateKeyBody } from "@workspace/api-zod";
import { requireClient } from "../middlewares/auth";
import {
  serializeKey,
  computeExpiry,
  generateKeyCode,
  type Plan,
} from "../lib/keys";

const router: IRouter = Router();

router.get("/me/keys", requireClient, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(licenseKeysTable)
    .where(eq(licenseKeysTable.userId, req.currentUser!.id))
    .orderBy(desc(licenseKeysTable.createdAt));
  res.json(rows.map(serializeKey));
});

router.post(
  "/me/keys/activate",
  requireClient,
  async (req, res): Promise<void> => {
    const parsed = ActivateKeyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const code = parsed.data.code.trim().toUpperCase();
    const userId = req.currentUser!.id;

    const [key] = await db
      .select()
      .from(licenseKeysTable)
      .where(eq(licenseKeysTable.code, code));

    if (!key) {
      res.status(404).json({ error: "Key não encontrada" });
      return;
    }
    if (key.status === "revoked") {
      res.status(400).json({ error: "Esta key foi revogada" });
      return;
    }
    if (key.userId && key.userId !== userId) {
      res.status(400).json({ error: "Esta key já pertence a outra conta" });
      return;
    }

    const now = new Date();

    // Claim ownership.
    await db
      .update(licenseKeysTable)
      .set({ userId, userEmail: req.currentUser!.email })
      .where(eq(licenseKeysTable.id, key.id));

    // Start the timer only if never activated — conditional update avoids
    // double-activation under concurrent requests.
    if (!key.activatedAt) {
      await db
        .update(licenseKeysTable)
        .set({
          activatedAt: now,
          expiresAt: computeExpiry(key.plan as Plan, now),
          status: "active",
        })
        .where(
          and(
            eq(licenseKeysTable.id, key.id),
            isNull(licenseKeysTable.activatedAt),
          ),
        );
    }

    const [updated] = await db
      .select()
      .from(licenseKeysTable)
      .where(eq(licenseKeysTable.id, key.id));

    res.json(serializeKey(updated));
  },
);

router.post(
  "/me/keys/:id/reset-device",
  requireClient,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [key] = await db
      .select()
      .from(licenseKeysTable)
      .where(
        and(
          eq(licenseKeysTable.id, raw),
          eq(licenseKeysTable.userId, req.currentUser!.id),
        ),
      );
    if (!key) {
      res.status(404).json({ error: "Key não encontrada" });
      return;
    }
    const [updated] = await db
      .update(licenseKeysTable)
      .set({ deviceFingerprint: null })
      .where(eq(licenseKeysTable.id, key.id))
      .returning();
    res.json(serializeKey(updated));
  },
);

router.post("/me/trial", requireClient, async (req, res): Promise<void> => {
  const userId = req.currentUser!.id;

  // The user must own at least one paid (non-trial, non-revoked) key.
  const paidKeys = await db
    .select()
    .from(licenseKeysTable)
    .where(
      and(
        eq(licenseKeysTable.userId, userId),
        ne(licenseKeysTable.plan, "trial"),
        ne(licenseKeysTable.status, "revoked"),
      ),
    );

  if (paidKeys.length === 0) {
    res.status(403).json({
      error: "Adquira pelo menos uma key para liberar o teste grátis",
    });
    return;
  }

  const [created] = await db
    .insert(licenseKeysTable)
    .values({
      code: generateKeyCode(),
      plan: "trial",
      status: "inactive",
      userId,
      userEmail: req.currentUser!.email,
    })
    .returning();

  res.status(201).json(serializeKey(created));
});

export default router;
