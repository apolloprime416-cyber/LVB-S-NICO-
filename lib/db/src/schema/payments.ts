import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentsTable = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  // PushinPay transaction id (uuid string returned by their API)
  providerId: text("provider_id").notNull().unique(),
  // 'daily' | 'weekly' | 'monthly' | 'lifetime'
  plan: text("plan").notNull(),
  valueCents: integer("value_cents").notNull(),
  // 'pending' | 'paid' | 'canceled' | 'expired'
  status: text("status").notNull().default("pending"),
  userId: uuid("user_id").notNull(),
  userEmail: text("user_email"),
  // License key generated after the payment is confirmed
  keyId: uuid("key_id"),
  qrCode: text("qr_code"),
  qrCodeBase64: text("qr_code_base64"),
  // Rate-limit guard: last time we queried PushinPay for this transaction
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type PaymentRow = typeof paymentsTable.$inferSelect;
