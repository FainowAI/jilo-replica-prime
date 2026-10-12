/**
 * Helpers compartilhados entre cielo-checkout, cielo-sop-token e cielo-reconcile
 * (CORS, resposta JSON, allowlist QA, D0, status do draft, alerta).
 */
import { callShopifyAdmin } from "./shopify-admin-client.ts";
import { CieloApiError, isApproved, isTerminal, type CieloSale } from "./cielo-client.ts";

/** H1: só libera um cart `authorizing` após esta idade E consulta por merchantOrderId vazia. */
export const SAFE_RELEASE_MIN = 10;

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = origin === "https://jilomarmitas.com" || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://jilomarmitas.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

/** Erro padrão `{code, message, userMessage}` (userMessage mantém compat com o front do VR). */
export function jsonResponse(body: unknown, status: number, cors: Record<string, string>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, ...extra, "Content-Type": "application/json" } });
}

export function errorResponse(code: string, message: string, status: number, cors: Record<string, string>): Response {
  return jsonResponse({ code, message, userMessage: message }, status, cors);
}

/** Fora de prod só e-mails da allowlist `ALELO_QA_EMAILS` (csv) passam (H4). */
export function isQaAllowed(email: string, csv: string | null | undefined): boolean {
  const list = (csv ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

function brtDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Cancelamento Cielo/Alelo só vale em D0 (dia civil de Brasília). */
export function isSameBrtDay(a: Date, b: Date): boolean {
  return brtDay(a) === brtDay(b);
}

export interface DraftStatus {
  status: string;
  order: { id: string; name: string } | null;
}

/** H3: consulta read-only do draft (não editamos shopify-draft-order.ts). Lança Error curto. */
export async function getDraftOrderStatus(draftId: string): Promise<DraftStatus> {
  const data = await callShopifyAdmin<{ draftOrder?: { status: string; order?: { id: string; name: string } | null } | null }>(
    `query DraftStatus($id: ID!) { draftOrder(id: $id) { status order { id name } } }`,
    { id: draftId },
  );
  if (!data.draftOrder) throw new Error("draft_not_found");
  return { status: data.draftOrder.status, order: data.draftOrder.order ?? null };
}

export interface AlertPayload {
  merchantOrderId: string;
  event: string;
  status?: string;
  ageMin?: number;
}
export type SendAlert = (a: AlertPayload) => Promise<void>;

/** Alerta sem PII. Nunca lança. Sem ALERT_WEBHOOK_URL cai em console.warn. */
export const defaultSendAlert: SendAlert = async (a) => {
  const url = Deno.env.get("ALERT_WEBHOOK_URL");
  if (!url) {
    console.warn(`[cielo-alert] ${a.event} ${a.status ?? "-"} ${a.merchantOrderId} age=${a.ageMin ?? "-"}`);
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[cielo] ${a.event} ${a.merchantOrderId}`, ...a }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    console.warn(`[cielo-alert] send_failed ${a.merchantOrderId}`);
  }
};

/** Reconciliação: 404 na busca por merchantOrderId = lista vazia (coordenação Track A). Outros erros propagam. */
export async function findIdsOrEmpty(find: (id: string) => Promise<string[]>, merchantOrderId: string): Promise<string[]> {
  try {
    return await find(merchantOrderId);
  } catch (err) {
    if (err instanceof CieloApiError && err.status === 404) return [];
    throw err;
  }
}

/** Classificação única da venda (checkout + reconcile). 10/11 = anulada; 2 não aprovada/3/13 = recusada; não terminal = pending. */
export function classifySale(sale: CieloSale): "approved" | "declined" | "voided" | "pending" {
  if (isApproved(sale)) return "approved";
  if (sale.status === 10 || sale.status === 11) return "voided";
  return isTerminal(sale.status) ? "declined" : "pending";
}
