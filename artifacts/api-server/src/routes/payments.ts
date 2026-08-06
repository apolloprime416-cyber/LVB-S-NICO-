import { Router, type IRouter } from "express";
import { and, eq, desc, isNull, or, lt } from "drizzle-orm";
import { db, paymentsTable, licenseKeysTable } from "@workspace/db";
import { requireClient } from "../middlewares/auth";
import { serializeKey } from "../lib/keys";
import {
  isPurchasablePlan,
  createPix,
  getTransaction,
  getWebhookBaseUrl,
} from "../lib/pushinpay";
import { settlePayment } from "../lib/paymentSettlement";
import { getEffectivePlans, getEffectivePriceCents } from "../lib/pricing";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Minimum interval between direct PushinPay status queries per transaction
// (their docs: at most one query per minute or the account may be blocked).
const PROVIDER_POLL_INTERVAL_MS = 60 * 1000;

/**
 * Atomically lease the right to query PushinPay for this payment.
 * Returns true only for the single caller that wins the 60s window —
 * concurrent pollers and webhook handlers all share this guard.
 */
async function leaseProviderCheck(
  paymentId: string,
  intervalMs: number = PROVIDER_POLL_INTERVAL_MS,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - intervalMs);
  const claimed = await db
    .update(paymentsTable)
    .set({ lastCheckedAt: new Date() })
    .where(
      and(
        eq(paymentsTable.id, paymentId),
        eq(paymentsTable.status, "pending"),
        or(
          isNull(paymentsTable.lastCheckedAt),
          lt(paymentsTable.lastCheckedAt, cutoff),
        ),
      ),
    )
    .returning({ id: paymentsTable.id });
  return claimed.length > 0;
}

/**
 * Lease-guarded provider check: queries PushinPay at most once per minute
 * per transaction and settles the payment when it is paid.
 */
async function checkWithProvider(
  payment: {
    id: string;
    providerId: string;
  },
  intervalMs: number = PROVIDER_POLL_INTERVAL_MS,
): Promise<{ status: string; keyId: string | null } | null> {
  const leased = await leaseProviderCheck(payment.id, intervalMs);
  if (!leased) return null;
  const tx = await getTransaction(payment.providerId);
  if (!tx) return null;
  return settlePayment(payment.id, tx);
}

/** Public: list of purchasable plans with prices (used by the pricing page). */
router.get("/public/plans", async (_req, res): Promise<void> => {
  const plans = await getEffectivePlans();
  res.json(plans);
});

/** Create a PIX charge for a plan. */
router.post("/me/payments", requireClient, async (req, res): Promise<void> => {
  const plan = String(req.body?.plan ?? "");
  if (!isPurchasablePlan(plan)) {
    res.status(400).json({ error: "Plano inválido" });
    return;
  }
  if (!process.env["PUSHINPAY_TOKEN"]) {
    res.status(503).json({
      error:
        "Pagamentos temporariamente indisponíveis: token da PushinPay não configurado.",
    });
    return;
  }
  try {
    const expected = await getEffectivePriceCents(plan);
    const webhookUrl = `${getWebhookBaseUrl()}/api/public/pushinpay-webhook`;
    const tx = await createPix(expected, webhookUrl);
    if (Number(tx.value) !== expected) {
      logger.error(
        { plan, expected, got: tx.value },
        "PushinPay retornou cobrança com valor divergente",
      );
      res.status(502).json({
        error: "Não foi possível gerar a cobrança PIX. Tente novamente.",
      });
      return;
    }
    const [payment] = await db
      .insert(paymentsTable)
      .values({
        providerId: String(tx.id).toLowerCase(),
        plan,
        valueCents: expected,
        status: "pending",
        userId: req.currentUser!.id,
        userEmail: req.currentUser!.email,
        qrCode: tx.qr_code ?? null,
        qrCodeBase64: tx.qr_code_base64 ?? null,
        // lastCheckedAt deliberately NOT set — keeps it null so the first
        // webhook or poll is never blocked by the 60s rate-limit lease.
      })
      .returning();
    res.status(201).json({
      id: payment!.id,
      plan,
      priceCents: payment!.valueCents,
      status: payment!.status,
      qrCode: payment!.qrCode,
      qrCodeBase64: payment!.qrCodeBase64,
    });
  } catch (err) {
    logger.error({ err }, "Falha ao criar cobrança PIX");
    res.status(502).json({
      error: "Não foi possível gerar a cobrança PIX. Tente novamente.",
    });
  }
});

/** Recent payments of the logged-in client (used to resume a pending PIX). */
router.get("/me/payments", requireClient, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.userId, req.currentUser!.id))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(10);
  res.json(
    rows.map((p) => ({
      id: p.id,
      plan: p.plan,
      priceCents: p.valueCents,
      status: p.status,
      qrCode: p.qrCode,
      qrCodeBase64: p.qrCodeBase64,
      createdAt: p.createdAt.toISOString(),
    })),
  );
});

/**
 * Payment status for the buyer. The panel polls this every few seconds;
 * PushinPay itself is queried at most once a minute per transaction
 * (atomic lease) — the webhook is the primary confirmation path.
 */
router.get(
  "/me/payments/:id",
  requireClient,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.id, raw),
          eq(paymentsTable.userId, req.currentUser!.id),
        ),
      );
    if (!payment) {
      res.status(404).json({ error: "Pagamento não encontrado" });
      return;
    }

    let status = payment.status;
    let keyId = payment.keyId;

    if (status === "pending") {
      try {
        const settled = await checkWithProvider(payment);
        if (settled) {
          status = settled.status === "unknown" ? status : settled.status;
          keyId = settled.keyId ?? keyId;
        }
      } catch (err) {
        logger.error({ err }, "Falha ao consultar PushinPay");
      }
    }

    let key = null;
    if (keyId) {
      const [row] = await db
        .select()
        .from(licenseKeysTable)
        .where(eq(licenseKeysTable.id, keyId));
      if (row) key = serializeKey(row);
    }

    res.json({ id: payment.id, plan: payment.plan, status, key });
  },
);

/**
 * Manual "Já fiz o pagamento" check — verifies immediately on PushinPay
 * (with a shorter 20s lease so the button feels responsive without
 * violating the provider's query limits).
 */
router.post(
  "/me/payments/:id/check",
  requireClient,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.id, raw),
          eq(paymentsTable.userId, req.currentUser!.id),
        ),
      );
    if (!payment) {
      res.status(404).json({ error: "Pagamento não encontrado" });
      return;
    }

    let status = payment.status;
    let keyId = payment.keyId;
    let checked = false;

    if (status === "pending") {
      try {
        const settled = await checkWithProvider(payment, 20 * 1000);
        if (settled) {
          checked = true;
          status = settled.status === "unknown" ? status : settled.status;
          keyId = settled.keyId ?? keyId;
        }
      } catch (err) {
        logger.error({ err }, "Falha ao consultar PushinPay (manual)");
        res.status(502).json({
          error: "Não foi possível consultar o pagamento agora. Tente de novo em instantes.",
        });
        return;
      }
    }

    let key = null;
    if (keyId) {
      const [row] = await db
        .select()
        .from(licenseKeysTable)
        .where(eq(licenseKeysTable.id, keyId));
      if (row) key = serializeKey(row);
    }

    res.json({ id: payment.id, plan: payment.plan, status, key, checked });
  },
);

/**
 * PushinPay webhook — active 24/7. The payload is NEVER trusted alone:
 * the status and amount are always re-verified against the PushinPay API.
 *
 * The webhook bypasses the 60s polling lease — PushinPay is calling us,
 * not a client browser. The settlePayment DB transaction is already
 * idempotent (atomic claim), so double-delivery is safe.
 *
 * We respond 200 BEFORE returning to guarantee PushinPay won't retry
 * a successful delivery as a failure.
 */
router.post(
  "/public/pushinpay-webhook",
  async (req, res): Promise<void> => {
    // Ack immediately — prevents PushinPay from timing out and retrying
    // before we even finish. Key generation happens asynchronously after.
    res.status(200).json({ ok: true });

    const providerId = String(
      req.body?.id ?? req.body?.transaction_id ?? "",
    ).toLowerCase();
    if (!providerId) return;

    try {
      const [payment] = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.providerId, providerId));
      if (!payment || payment.status !== "pending") return;

      // Bypass the rate-limit lease — go straight to the API.
      const tx = await getTransaction(payment.providerId);
      if (!tx) return;
      await settlePayment(payment.id, tx);
    } catch (err) {
      logger.error({ err }, "Falha ao processar webhook PushinPay");
    }
  },
);

/**
 * Admin: force-check ALL pending payments right now, regardless of lease.
 * Useful to recover payments where the webhook was missed.
 */
router.post(
  "/admin/payments/recheck",
  async (req, res): Promise<void> => {
    const pending = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.status, "pending"));

    res.json({ checking: pending.length });

    // Run async — do not block the response
    for (const payment of pending) {
      try {
        const tx = await getTransaction(payment.providerId);
        if (!tx) continue;
        const result = await settlePayment(payment.id, tx);
        if (result.status === "paid") {
          logger.info(
            { paymentId: payment.id, plan: payment.plan },
            "Pagamento recuperado via recheck manual",
          );
        }
      } catch (err) {
        logger.error({ err, paymentId: payment.id }, "Erro no recheck manual");
      }
    }
  },
);

export default router;
