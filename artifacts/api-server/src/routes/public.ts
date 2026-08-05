import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, licenseKeysTable } from "@workspace/db";
import { PublicResetKeyBody, ValidateKeyBody } from "@workspace/api-zod";
import { computeExpiry, type Plan } from "../lib/keys";

const router: IRouter = Router();

router.post("/public/reset-key", async (req, res): Promise<void> => {
  const parsed = PublicResetKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(404).json({ error: "Key não encontrada" });
    return;
  }
  const code = parsed.data.code.trim().toUpperCase();

  const [key] = await db
    .select()
    .from(licenseKeysTable)
    .where(eq(licenseKeysTable.code, code));

  if (!key || key.status === "revoked") {
    res.status(404).json({ error: "Key não encontrada" });
    return;
  }

  await db
    .update(licenseKeysTable)
    .set({ deviceFingerprint: null })
    .where(eq(licenseKeysTable.id, key.id));

  res.json({ ok: true, plan: key.plan });
});

// Extension validation: activates on first use, binds device, checks expiry.
router.post("/public/validate", async (req, res): Promise<void> => {
  const parsed = ValidateKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.json({ valid: false, reason: "invalid_request", plan: null, expiresAt: null });
    return;
  }
  const code = parsed.data.code.trim().toUpperCase();
  const fingerprint = parsed.data.fingerprint.trim();

  const [key] = await db
    .select()
    .from(licenseKeysTable)
    .where(eq(licenseKeysTable.code, code));

  if (!key) {
    res.json({ valid: false, reason: "not_found", plan: null, expiresAt: null });
    return;
  }
  if (key.status === "revoked") {
    res.json({ valid: false, reason: "revoked", plan: key.plan, expiresAt: null });
    return;
  }

  const now = new Date();

  // First use: activate and bind the device (this starts the timer).
  // Conditional update (activatedAt IS NULL) prevents concurrent requests
  // from both activating; the loser falls through to the normal checks below.
  if (!key.activatedAt) {
    const expiresAt = computeExpiry(key.plan as Plan, now);
    const [updated] = await db
      .update(licenseKeysTable)
      .set({
        status: "active",
        activatedAt: now,
        expiresAt,
        deviceFingerprint: fingerprint,
      })
      .where(
        and(
          eq(licenseKeysTable.id, key.id),
          isNull(licenseKeysTable.activatedAt),
        ),
      )
      .returning();
    if (updated) {
      res.json({
        valid: true,
        reason: null,
        plan: updated.plan,
        expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
      });
      return;
    }
    // Lost the race: re-read the row and continue with standard checks.
    const [fresh] = await db
      .select()
      .from(licenseKeysTable)
      .where(eq(licenseKeysTable.id, key.id));
    if (!fresh) {
      res.json({ valid: false, reason: "not_found", plan: null, expiresAt: null });
      return;
    }
    Object.assign(key, fresh);
  }

  // Already activated: check expiry.
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) {
    if (key.status !== "expired") {
      await db
        .update(licenseKeysTable)
        .set({ status: "expired" })
        .where(eq(licenseKeysTable.id, key.id));
    }
    res.json({ valid: false, reason: "expired", plan: key.plan, expiresAt: key.expiresAt.toISOString() });
    return;
  }

  // Device binding.
  if (!key.deviceFingerprint) {
    await db
      .update(licenseKeysTable)
      .set({ deviceFingerprint: fingerprint })
      .where(eq(licenseKeysTable.id, key.id));
  } else if (key.deviceFingerprint !== fingerprint) {
    res.json({
      valid: false,
      reason: "device_mismatch",
      plan: key.plan,
      expiresAt: key.expiresAt ? key.expiresAt.toISOString() : null,
    });
    return;
  }

  res.json({
    valid: true,
    reason: null,
    plan: key.plan,
    expiresAt: key.expiresAt ? key.expiresAt.toISOString() : null,
  });
});

export default router;
