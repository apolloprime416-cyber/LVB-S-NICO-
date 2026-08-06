import { Router, type IRouter } from "express";
import { and, eq, desc, ne, isNull } from "drizzle-orm";
import { db, licenseKeysTable, extensionFilesTable } from "@workspace/db";
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

function cleanCustomerField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, 120);
  return v.length > 0 ? v : null;
}

/** Returns the cleaned email, or undefined when the value is present but malformed. */
function cleanCustomerEmail(value: unknown): string | null | undefined {
  const v = cleanCustomerField(value);
  if (v === null) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return undefined;
  return v;
}

router.patch(
  "/me/keys/:id/customer",
  requireClient,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [key] = await db
      .select()
      .from(licenseKeysTable)
      .where(
        and(
          eq(licenseKeysTable.id, rawId),
          eq(licenseKeysTable.userId, req.currentUser!.id),
        ),
      );
    if (!key) {
      res.status(404).json({ error: "Key não encontrada" });
      return;
    }
    const customerEmail = cleanCustomerEmail(req.body?.customerEmail);
    if (customerEmail === undefined) {
      res.status(400).json({ error: "E-mail do cliente inválido" });
      return;
    }
    const [updated] = await db
      .update(licenseKeysTable)
      .set({
        customerName: cleanCustomerField(req.body?.customerName),
        customerEmail,
      })
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

  const trialCustomerEmail = cleanCustomerEmail(req.body?.customerEmail);
  if (trialCustomerEmail === undefined) {
    res.status(400).json({ error: "E-mail do cliente inválido" });
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
      customerName: cleanCustomerField(req.body?.customerName),
      customerEmail: trialCustomerEmail,
    })
    .returning();

  res.status(201).json(serializeKey(created));
});

/** True when the user owns at least one paid (non-trial, non-revoked) key. */
async function hasPaidKey(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: licenseKeysTable.id })
    .from(licenseKeysTable)
    .where(
      and(
        eq(licenseKeysTable.userId, userId),
        ne(licenseKeysTable.plan, "trial"),
        ne(licenseKeysTable.status, "revoked"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// Extension download availability for the logged-in client.
router.get("/me/extension", requireClient, async (req, res): Promise<void> => {
  const [file] = await db
    .select({
      filename: extensionFilesTable.filename,
      size: extensionFilesTable.size,
      updatedAt: extensionFilesTable.updatedAt,
    })
    .from(extensionFilesTable)
    .limit(1);
  const unlocked = await hasPaidKey(req.currentUser!.id);
  res.json({
    available: Boolean(file),
    unlocked,
    filename: file?.filename ?? null,
    size: file?.size ?? null,
    updatedAt: file?.updatedAt ? file.updatedAt.toISOString() : null,
  });
});

// Download the extension zip — only for clients who own a paid key.
router.get(
  "/me/extension/download",
  requireClient,
  async (req, res): Promise<void> => {
    const unlocked = await hasPaidKey(req.currentUser!.id);
    if (!unlocked) {
      res.status(403).json({
        error: "Adquira uma key para liberar o download da extensão",
      });
      return;
    }
    const [file] = await db.select().from(extensionFilesTable).limit(1);
    if (!file) {
      res.status(404).json({ error: "Nenhum arquivo disponível" });
      return;
    }
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename.replace(/[^\w.\-]/g, "_")}"`,
    );
    res.send(Buffer.from(file.data));
  },
);

export default router;
