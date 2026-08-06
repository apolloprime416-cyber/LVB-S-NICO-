import app from "./app";
import { logger } from "./lib/logger";
import { seedAdmin } from "./lib/seedAdmin";
import { db, paymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getTransaction } from "./lib/pushinpay";
import { settlePayment } from "./lib/paymentSettlement";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Background job: re-check pending payments that haven't been verified
 * in the last 3 minutes. Covers cases where the webhook was missed or
 * the user stopped polling before the payment was confirmed.
 */
async function recoverPendingPayments(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 3 * 60 * 1000); // 3 min ago
    const pending = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.status, "pending"));

    const stale = pending.filter(
      (p) => !p.lastCheckedAt || p.lastCheckedAt < cutoff,
    );

    for (const payment of stale) {
      try {
        const tx = await getTransaction(payment.providerId);
        if (!tx) continue;
        const result = await settlePayment(payment.id, tx);
        if (result.status === "paid") {
          logger.info(
            { paymentId: payment.id, plan: payment.plan, userId: payment.userId },
            "Pagamento recuperado pelo job em background",
          );
        }
        // Bump lastCheckedAt so we don't hammer the same payment every cycle
        await db
          .update(paymentsTable)
          .set({ lastCheckedAt: new Date() })
          .where(eq(paymentsTable.id, payment.id));
      } catch (err) {
        logger.error({ err, paymentId: payment.id }, "Erro no job de recuperação");
      }
    }
  } catch (err) {
    logger.error({ err }, "Erro no job de recuperação de pagamentos");
  }
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  try {
    await seedAdmin();
  } catch (seedErr) {
    logger.error({ err: seedErr }, "Failed to seed admin account");
  }

  logger.info({ port }, "Server listening");

  // Start background recovery job — runs every 2 minutes
  setInterval(recoverPendingPayments, 2 * 60 * 1000);
  // Also run once on startup to catch anything stuck from before restart
  setTimeout(recoverPendingPayments, 5000);
});
