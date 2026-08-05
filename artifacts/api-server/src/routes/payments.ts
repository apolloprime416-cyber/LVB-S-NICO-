import { Router, type IRouter } from "express";
import { and, eq, sql, isNull, or, lt } from "drizzle-orm";
import { db, paymentsTable, licenseKeysTable } from "@workspace/db";
import { requireClient } from "../middlewares/auth";
import { generateKeyCode, serializeKey } from "../lib/keys";
import {
  PLAN_PRICES_CENTS,
  PLAN_LABELS,
  isPurchasablePlan,
  createPix,
  getTransaction,
  getWebhookBaseUrl,
  type PushinPayTransaction,
} from "../lib/pushinpay";
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
async function leaseProviderCheck(paymentId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - PROVIDER_POLL_INTERVAL_MS);
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
 * Verify the provider transaction against the stored payment and, if truly
 * paid for the right amount, create the license key and mark the payment
 * paid — all in one database transaction, exactly once.
 *
 * Returns the key id when the payment is (now or already) fulfilled.
 */
async function settlePayment(
  paymentId: string,
  tx: PushinPayTransaction,
): Promise<{ status: string; keyId: string | null }> {
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, paymentId));
  if (!payment) return { status: "unknown", keyId: null };
  if (payment.status !== "pending") {
    return { status: payment.status, keyId: payment.keyId };
  }

  if (tx.status === "canceled" || tx.status === "expired") {
    await db
      .update(paymentsTable)
      .set({ status: tx.status })
      .where(
        and(eq(paymentsTable.id, paymentId), eq(paymentsTable.status, "pending")),
      );
    return { status: tx.status, keyId: null };
  }

  if (tx.status !== "paid") {
    return { status: "pending", keyId: null };
  }

  // Bind fulfillment to the exact expected amount and transaction id.
  const paidValue = Number(tx.value);
  if (String(tx.id) !== payment.providerId || paidValue !== payment.valueCents) {
    logger.error(
      { paymentId, expected: payment.valueCents, got: tx.value, txId: tx.id },
      "Pagamento com valor/transação divergente — não será liberado",
    );
    return { status: "pending", keyId: null };
  }

  // Atomic: claim pending -> paid, create key, link key. Rolls back together.
  const keyId = await db.transaction(async (trx) => {
    const claimed = await trx
      .update(paymentsTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(
        and(
          eq(paymentsTable.id, paymentId),
          eq(paymentsTable.status, "pending"),
        ),
      )
      .returning({ id: paymentsTable.id });
    if (claimed.length === 0) return null; // lost the race — already settled

    const [key] = await trx
      .insert(licenseKeysTable)
      .values({
        code: generateKeyCode(),
        plan: payment.plan,
        status: "inactive",
        userId: payment.userId,
        userEmail: payment.userEmail,
      })
      .returning({ id: licenseKeysTable.id });

    await trx
      .update(paymentsTable)
      .set({ keyId: key!.id })
      .where(eq(paymentsTable.id, paymentId));
    return key!.id;
  });

  if (keyId) {
    logger.info(
      { paymentId, plan: payment.plan, keyId },
      "Pagamento confirmado — key gerada",
    );
    return { status: "paid", keyId };
  }
  // Another request settled it first — re-read for the final state.
  const [fresh] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, paymentId));
  return { status: fresh?.status ?? "paid", keyId: fresh?.keyId ?? null };
}

/**
 * Lease-guarded provider check: queries PushinPay at most once per minute
 * per transaction and settles the payment when it is paid.
 */
async function checkWithProvider(payment: {
  id: string;
  providerId: string;
}): Promise<{ status: string; keyId: string | null } | null> {
  const leased = await leaseProviderCheck(payment.id);
  if (!leased) return null;
  const tx = await getTransaction(payment.providerId);
  if (!tx) return null;
  return settlePayment(payment.id, tx);
}

/** Public: list of purchasable plans with prices (used by the pricing page). */
router.get("/public/plans", (_req, res): void => {
  res.json(
    (Object.keys(PLAN_PRICES_CENTS) as (keyof typeof PLAN_PRICES_CENTS)[]).map(
      (plan) => ({
        plan,
        label: PLAN_LABELS[plan],
        priceCents: PLAN_PRICES_CENTS[plan],
      }),
    ),
  );
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
    const expected = PLAN_PRICES_CENTS[plan];
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
        providerId: String(tx.id),
        plan,
        valueCents: expected,
        status: "pending",
        userId: req.currentUser!.id,
        userEmail: req.currentUser!.email,
        qrCode: tx.qr_code ?? null,
        qrCodeBase64: tx.qr_code_base64 ?? null,
        lastCheckedAt: new Date(),
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
 * PushinPay webhook — active 24/7. The payload is never trusted alone:
 * the status and amount are re-verified against the PushinPay API before
 * any key is issued. Processing completes BEFORE the 200 ack, so provider
 * retries cover transient failures. The provider lookup is behind the same
 * atomic per-transaction lease as buyer polling, so an abusive caller
 * cannot force query floods against PushinPay.
 */
router.post(
  "/public/pushinpay-webhook",
  async (req, res): Promise<void> => {
    const providerId = String(req.body?.id ?? req.body?.transaction_id ?? "");
    if (!providerId) {
      res.status(200).json({ ok: true }); // malformed — nothing to retry
      return;
    }
    try {
      const [payment] = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.providerId, providerId));
      if (!payment || payment.status !== "pending") {
        res.status(200).json({ ok: true });
        return;
      }
      const settled = await checkWithProvider(payment);
      if (settled === null && payment.status === "pending") {
        // Lease busy (checked <60s ago) — ask the provider to retry later
        // instead of acking a payment we haven't verified yet.
        const [fresh] = await db
          .select({ status: paymentsTable.status })
          .from(paymentsTable)
          .where(eq(paymentsTable.id, payment.id));
        if (fresh?.status === "pending") {
          res.status(429).json({ retry: true });
          return;
        }
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Falha ao processar webhook PushinPay");
      res.status(500).json({ error: "retry" });
    }
  },
);

export default router;
