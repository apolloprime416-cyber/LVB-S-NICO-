import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A promotion temporarily overrides the price of one plan and shows a
// banner to every client until it expires or is removed.
export const promotionsTable = pgTable("promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 'daily' | 'weekly' | 'monthly' | 'lifetime'
  plan: text("plan").notNull(),
  priceCents: integer("price_cents").notNull(),
  bannerText: text("banner_text"),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPromotionSchema = createInsertSchema(promotionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPromotion = z.infer<typeof insertPromotionSchema>;
export type PromotionRow = typeof promotionsTable.$inferSelect;

// Admin-editable base price per plan; falls back to defaults in code when absent.
export const planPricesTable = pgTable("plan_prices", {
  plan: text("plan").primaryKey(),
  priceCents: integer("price_cents").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PlanPriceRow = typeof planPricesTable.$inferSelect;
