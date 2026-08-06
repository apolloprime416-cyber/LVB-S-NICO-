/**
 * settlePayment — verifica a transação PushinPay e, se paga com o valor
 * correto, cria a key e marca o pagamento como pago, atomicamente.
 *
 * Exportado como módulo separado para ser reutilizado pelo job de background
 * (index.ts) e pela rota de pagamentos (routes/payments.ts).
 */
import { and, eq } from "drizzle-orm";
import { db, paymentsTable, licenseKeysTable } from "@workspace/db";
import { generateKeyCode, computeExpiry, type Plan } from "./keys";
import { type PushinPayTransaction } from "./pushinpay";
import { logger } from "./logger";

export async function settlePayment(
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

  // Value tolerance: PushinPay stores values in centavos (integer), but
  // some responses arrive as a decimal string (e.g. "8.90" instead of 890).
  // Accept both: if rawValue < 100, treat as reais and convert to centavos.
  const rawValue = Number(tx.value);
  const paidValue =
    rawValue > 0 && rawValue < 100
      ? Math.round(rawValue * 100) // reais → centavos
      : Math.round(rawValue); // already centavos

  if (String(tx.id).toLowerCase() !== payment.providerId.toLowerCase()) {
    logger.error(
      { paymentId, expectedProviderId: payment.providerId, gotTxId: tx.id },
      "Pagamento com ID divergente — não será liberado",
    );
    return { status: "pending", keyId: null };
  }
  if (paidValue !== payment.valueCents) {
    logger.error(
      { paymentId, expected: payment.valueCents, rawValue, paidValue },
      "Pagamento com valor divergente — não será liberado",
    );
    return { status: "pending", keyId: null };
  }

  // Atomic: claim pending → paid, create key, link key. Rolls back together.
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

    const now = new Date();
    const [key] = await trx
      .insert(licenseKeysTable)
      .values({
        code: generateKeyCode(),
        plan: payment.plan,
        // Keys are active from the moment of purchase — no panel activation needed
        status: "active",
        activatedAt: now,
        expiresAt: computeExpiry(payment.plan as Plan, now),
        userId: payment.userId,
        userEmail: payment.userEmail,
        // createdById = buyer's userId so the key appears in their panel
        createdById: payment.userId,
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
