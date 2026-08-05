import type { Plan } from "./keys";

const BASE_URL = "https://api.pushinpay.com.br/api";

/** Prices in centavos for each purchasable plan. */
export const PLAN_PRICES_CENTS: Record<Exclude<Plan, "trial">, number> = {
  daily: 390,
  weekly: 890,
  monthly: 1590,
  lifetime: 2290,
};

export const PLAN_LABELS: Record<Exclude<Plan, "trial">, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
  lifetime: "Vitalício",
};

export function isPurchasablePlan(
  plan: string,
): plan is Exclude<Plan, "trial"> {
  return plan in PLAN_PRICES_CENTS;
}

function getToken(): string {
  const token = process.env["PUSHINPAY_TOKEN"];
  if (!token) {
    throw new Error(
      "PUSHINPAY_TOKEN não configurado. Adicione o token da PushinPay nas variáveis de ambiente.",
    );
  }
  return token;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export interface PushinPayTransaction {
  id: string;
  status: string; // created | paid | canceled | expired
  value: number | string;
  qr_code?: string;
  qr_code_base64?: string;
}

/** Create a PIX charge. Value is in centavos (min 50). */
export async function createPix(
  valueCents: number,
  webhookUrl: string | null,
): Promise<PushinPayTransaction> {
  const body: Record<string, unknown> = { value: valueCents };
  if (webhookUrl) body["webhook_url"] = webhookUrl;
  const res = await fetch(`${BASE_URL}/pix/cashIn`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PushinPay createPix falhou (${res.status}): ${text}`);
  }
  return (await res.json()) as PushinPayTransaction;
}

/** Query a transaction status directly on PushinPay. */
export async function getTransaction(
  id: string,
): Promise<PushinPayTransaction | null> {
  const res = await fetch(
    `${BASE_URL}/transactions/${encodeURIComponent(id)}`,
    { headers: headers() },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PushinPay consulta falhou (${res.status}): ${text}`);
  }
  const data = (await res.json()) as unknown;
  if (Array.isArray(data)) return null; // API returns [] when not found
  return data as PushinPayTransaction;
}

/** Base URL where PushinPay should deliver webhooks (production panel). */
export function getWebhookBaseUrl(): string {
  return process.env["PUBLIC_BASE_URL"] || "https://lvbsonic.replit.app";
}
