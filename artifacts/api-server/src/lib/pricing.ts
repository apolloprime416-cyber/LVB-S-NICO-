import { desc, gt } from "drizzle-orm";
import { db, planPricesTable, promotionsTable } from "@workspace/db";
import { PLAN_PRICES_CENTS, PLAN_LABELS } from "./pushinpay";
import type { Plan } from "./keys";

export type PurchasablePlan = Exclude<Plan, "trial">;

export interface EffectivePlan {
  plan: PurchasablePlan;
  label: string;
  /** Base price (admin override or default). */
  basePriceCents: number;
  /** Price actually charged now (promo price when a promo is active). */
  priceCents: number;
  promo: {
    priceCents: number;
    endsAt: string;
    bannerText: string | null;
  } | null;
}

/** Base + promotional pricing for every purchasable plan, DB-driven. */
export async function getEffectivePlans(): Promise<EffectivePlan[]> {
  const [overrides, activePromos] = await Promise.all([
    db.select().from(planPricesTable),
    db
      .select()
      .from(promotionsTable)
      .where(gt(promotionsTable.endsAt, new Date()))
      .orderBy(desc(promotionsTable.createdAt)),
  ]);
  const overrideMap = new Map(overrides.map((o) => [o.plan, o.priceCents]));

  return (Object.keys(PLAN_PRICES_CENTS) as PurchasablePlan[]).map((plan) => {
    const basePriceCents =
      overrideMap.get(plan) ?? PLAN_PRICES_CENTS[plan];
    // Most recently created still-active promo wins for the plan.
    const promo = activePromos.find((p) => p.plan === plan) ?? null;
    return {
      plan,
      label: PLAN_LABELS[plan],
      basePriceCents,
      priceCents: promo ? promo.priceCents : basePriceCents,
      promo: promo
        ? {
            priceCents: promo.priceCents,
            endsAt: promo.endsAt.toISOString(),
            bannerText: promo.bannerText ?? null,
          }
        : null,
    };
  });
}

/** Price to charge right now for one plan. */
export async function getEffectivePriceCents(
  plan: PurchasablePlan,
): Promise<number> {
  const plans = await getEffectivePlans();
  const found = plans.find((p) => p.plan === plan);
  return found ? found.priceCents : PLAN_PRICES_CENTS[plan];
}
