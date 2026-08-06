import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const licenseKeysTable = pgTable("license_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  // 'trial' | 'daily' | 'weekly' | 'monthly' | 'lifetime'
  plan: text("plan").notNull(),
  // 'inactive' | 'active' | 'expired' | 'revoked'
  status: text("status").notNull().default("inactive"),
  userId: uuid("user_id"),
  userEmail: text("user_email"),
  createdById: uuid("created_by_id"),
  deviceFingerprint: text("device_fingerprint"),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertLicenseKeySchema = createInsertSchema(licenseKeysTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLicenseKey = z.infer<typeof insertLicenseKeySchema>;
export type LicenseKeyRow = typeof licenseKeysTable.$inferSelect;
