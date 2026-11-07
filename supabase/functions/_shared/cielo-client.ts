/**
 * Cliente da API Cielo E-commerce (Alelo via `DebitCard` + `Brand Elo`) —
 * Track A do build `cielo-vr-bling`. Contrato: `.claude/.work/cielo-vr-bling/plan.md`.
 *
 * O PAN nunca passa por aqui: o navegador tokeniza via Silent Order Post e o
 * servidor só recebe o `PaymentToken`.
 *
 * Nunca logar: MerchantKey, tokens (bearer/SOP/PaymentToken), holder, body.
 * Log = `[cielo] <método> <path-sem-ids> -> <status> <merchantOrderId?>`.
 * Erros de rede: só `err.name`.
 */

// ---------------------------------------------------------------------------
// Ambiente / hosts
// ---------------------------------------------------------------------------

export type CieloEnv = "mock" | "sandbox" | "prod";

interface CieloHosts {
  api: string;
  query: string;
  oauth: string;
  sop: string;
}

const CIELO_HOSTS: Record<"sandbox" | "prod", CieloHosts> = {
  sandbox: {
    api: "https://apisandbox.cieloecommerce.cielo.com.br",
    query: "https://apiquerysandbox.cieloecommerce.cielo.com.br",
    oauth: "https://authsandbox.braspag.com.br/oauth2/token",
    sop: "https://transactionsandbox.pagador.com.br/post/api/public/v2/accesstoken",
  },
  prod: {
    api: "https://api.cieloecommerce.cielo.com.br",
    query: "https://apiquery.cieloecommerce.cielo.com.br",
    oauth: "https://auth.braspag.com.br/oauth2/token",
    sop: "https://transaction.pagador.com.br/post/api/public/v2/accesstoken",
  },
};

/** URL do script SOP — fixa; o front nunca usa URL vinda da edge. */
export const SOP_SCRIPT_URL = "https://www.pagador.com.br/post/scripts/silentorderpost-1.0.min.js";

export function sopEnvironment(env: CieloEnv): "sandbox" | "production" {
  return env === "prod" ? "production" : "sandbox";
}

// ---------------------------------------------------------------------------
// Erro
// ---------------------------------------------------------------------------

/** Vocabulário interno fechado — nunca o corpo bruto da resposta. */
export type CieloErrorCode =
  | "cielo_env_invalid"
  | "cielo_config_missing"
  | "cielo_timeout"
  | "cielo_bad_response"
  | `cielo_http_${number}`;

export class CieloApiError extends Error {
  code: string;
  status?: number;
  /** `Code` do corpo `[{Code, Message}]` que a Cielo devolve em HTTP 400 (ex.: "173" = meio de pagamento não habilitado). Só o código, nunca a Message. */
  cieloCode?: string;

  constructor(params: { code: CieloErrorCode; status?: number; cieloCode?: string }) {
    super(params.code);
    this.name = "CieloApiError";
    this.code = params.code;
    this.status = params.status;
    this.cieloCode = params.cieloCode;
  }
}

/** Extrai o primeiro `Code` de um corpo de erro `[{Code, Message}]` (ou `{Code}`); undefined se não houver. */
function parseCieloErrorCode(text: string): string | undefined {
  try {
    const data = JSON.parse(text) as unknown;
    const first = Array.isArray(data) ? data[0] : data;
    const code = (first as { Code?: unknown } | null)?.Code;
    return typeof code === "number" || (typeof code === "string" && /^[A-Za-z0-9]{1,8}$/.test(code)) ? String(code) : undefined;
  } catch {
    return undefined;
  }
}

/** Lê CIELO_ENV a cada chamada, SEM default: ausente/inválido falha fechado. */
export function getCieloEnv(): CieloEnv {
  const raw = Deno.env.get("CIELO_ENV");
  if (raw !== "mock" && raw !== "sandbox" && raw !== "prod") {
    throw new CieloApiError({ code: "cielo_env_invalid" });
  }
  return raw;
}

function getHosts(env: CieloEnv): CieloHosts {
  if (env !== "mock") return CIELO_HOSTS[env];
  // CIELO_MOCK_BASE_URL só é lido com env=mock e só aceita loopback http.
  let u: URL;
  try {
    u = new URL(Deno.env.get("CIELO_MOCK_BASE_URL") ?? "");
  } catch {
    throw new CieloApiError({ code: "cielo_env_invalid" });
  }
  if (u.protocol !== "http:" || (u.hostname !== "localhost" && u.hostname !== "127.0.0.1")) {
    throw new CieloApiError({ code: "cielo_env_invalid" });
  }
  const base = u.origin;
  return { api: base, query: base, oauth: `${base}/oauth2/token`, sop: `${base}/post/api/public/v2/accesstoken` };
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new CieloApiError({ code: "cielo_config_missing" });
  return v;
}

// ---------------------------------------------------------------------------
// Chamada HTTP (sem retry, timeout 30s)
// ---------------------------------------------------------------------------

let timeoutMs = 30_000;

async function cieloFetch(
  method: string,
  label: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
  merchantOrderId?: string,
): Promise<unknown> {
  const tag = `[cielo] ${method} ${label}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  let text: string;
  try {
    res = await fetch(url, { method, headers, body, signal: controller.signal });
    text = await res.text();
  } catch (err) {
    // ponytail: timeout e falha de rede colapsam em cielo_timeout — para o chamador
    // o efeito é o mesmo (estado desconhecido, reconciliar por merchantOrderId).
    console.error(`${tag} -> ${(err as { name?: string })?.name ?? "error"}`);
    throw new CieloApiError({ code: "cielo_timeout" });
  } finally {
    clearTimeout(timer);
  }
  const suffix = merchantOrderId ? ` ${merchantOrderId}` : "";
  if (!res.ok) {
    // 4xx da Cielo traz `[{Code, Message}]`: o Code (só ele) vai para o log e para o erro — é o que diferencia
    // "meio de pagamento não habilitado" (173) de "token não encontrado" (180). A Message nunca é logada.
    const cieloCode = res.status >= 400 && res.status < 500 ? parseCieloErrorCode(text) : undefined;
    console.error(`${tag} -> ${res.status}${cieloCode ? ` code=${cieloCode}` : ""}${suffix}`);
    throw new CieloApiError({ code: `cielo_http_${res.status}`, status: res.status, cieloCode });
  }
  console.log(`${tag} -> ${res.status}${suffix}`);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new CieloApiError({ code: "cielo_bad_response", status: res.status });
  }
}

function merchantHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    MerchantId: requireEnv("CIELO_MERCHANT_ID"),
    MerchantKey: requireEnv("CIELO_MERCHANT_KEY"),
    RequestId: crypto.randomUUID(),
  };
}

// ---------------------------------------------------------------------------
// Silent Order Post: OAuth Braspag (cache) + AccessToken SOP
// ---------------------------------------------------------------------------

let bearerCache: { env: CieloEnv; token: string; expiresAt: number } | null = null;
const BEARER_MARGIN_MS = 60_000;

async function getBearer(env: CieloEnv, oauthUrl: string): Promise<string> {
  if (bearerCache && bearerCache.env === env && bearerCache.expiresAt - BEARER_MARGIN_MS > Date.now()) {
    return bearerCache.token;
  }
  const basic = btoa(`${requireEnv("CIELO_SOP_CLIENT_ID")}:${requireEnv("CIELO_SOP_CLIENT_SECRET")}`);
  const data = await cieloFetch(
    "POST",
    "/oauth2/token",
    oauthUrl,
    { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    "grant_type=client_credentials",
  ) as { access_token?: unknown; expires_in?: unknown } | undefined;
  if (typeof data?.access_token !== "string" || !data.access_token) {
    throw new CieloApiError({ code: "cielo_bad_response" });
  }
  const expiresIn = Number(data.expires_in);
  bearerCache = {
    env,
    token: data.access_token,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 300) * 1000,
  };
  return bearerCache.token;
}

export async function getSopAccessToken(): Promise<{ accessToken: string; expiresIn: number }> {
  const env = getCieloEnv();
  const hosts = getHosts(env);
  const bearer = await getBearer(env, hosts.oauth);
  const data = await cieloFetch("POST", "/post/api/public/v2/accesstoken", hosts.sop, {
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearer}`,
    MerchantId: requireEnv("CIELO_MERCHANT_ID"),
  }) as { AccessToken?: unknown; ExpiresIn?: unknown; ExpiresDate?: unknown } | undefined;
  if (typeof data?.AccessToken !== "string" || !data.AccessToken) {
    throw new CieloApiError({ code: "cielo_bad_response" });
  }
  // ponytail: a doc não deixa claro se vem ExpiresIn (s) ou só ExpiresDate; aceita os dois, fallback 300s.
  let expiresIn = Number(data.ExpiresIn);
  if (!(expiresIn > 0) && typeof data.ExpiresDate === "string") {
    expiresIn = Math.floor((Date.parse(data.ExpiresDate) - Date.now()) / 1000);
  }
  return { accessToken: data.AccessToken, expiresIn: expiresIn > 0 ? expiresIn : 300 };
}

// ---------------------------------------------------------------------------
// Venda
// ---------------------------------------------------------------------------

export interface CieloSale {
  paymentId: string;
  merchantOrderId: string;
  status: number;
  returnCode: string;
  returnMessage?: string;
  amountCents: number;
  tid?: string;
  proofOfSale?: string;
  authorizationCode?: string;
  /** Garantia de cancelamento: a Cielo TENTOU anular uma venda Status 0 (a doc diz que indica cancelada; só vale com Status 0). */
  tryAutomaticCancellation?: boolean;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : v == null ? undefined : String(v));

/** Devolve SÓ os campos de CieloSale — descarta CardNumber mascarado, Holder, Customer, Links. */
function toSale(data: unknown, fallbackMerchantOrderId?: string): CieloSale {
  const d = data as { MerchantOrderId?: unknown; Payment?: Record<string, unknown> } | undefined;
  const p = d?.Payment;
  const status = Number(p?.Status);
  const amountCents = Number(p?.Amount);
  const paymentId = str(p?.PaymentId);
  const merchantOrderId = str(d?.MerchantOrderId) ?? fallbackMerchantOrderId;
  if (!p || !paymentId || !merchantOrderId || !Number.isInteger(status) || !Number.isSafeInteger(amountCents)) {
    throw new CieloApiError({ code: "cielo_bad_response" });
  }
  return {
    paymentId,
    merchantOrderId,
    status,
    returnCode: str(p.ReturnCode) ?? "",
    returnMessage: str(p.ReturnMessage),
    amountCents,
    tid: str(p.Tid),
    proofOfSale: str(p.ProofOfSale),
    authorizationCode: str(p.AuthorizationCode),
    ...(p.TryAutomaticCancellation === true ? { tryAutomaticCancellation: true } : {}),
  };
}

function assertCents(n: number): void {
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("Valor inválido.");
}

/** SEM retry: um segundo POST é uma segunda cobrança. Timeout → `cielo_timeout` (chamador reconcilia). */
export async function createVoucherSale(i: {
  merchantOrderId: string;
  amountCents: number;
  paymentToken: string;
  holderName: string;
  softDescriptor?: string;
}): Promise<CieloSale> {
  assertCents(i.amountCents);
  const hosts = getHosts(getCieloEnv());
  const body = {
    MerchantOrderId: i.merchantOrderId,
    // ponytail: a doc de venda não diz onde o Holder vai quando há PaymentToken; Customer.Name é o campo documentado.
    Customer: { Name: i.holderName },
    Payment: {
      Type: "DebitCard",
      Amount: i.amountCents,
      Installments: 1,
      Authenticate: false,
      ...(i.softDescriptor ? { SoftDescriptor: i.softDescriptor } : {}),
      DebitCard: { PaymentToken: i.paymentToken, Brand: "Elo" },
    },
  };
  // /1/sales/, não /v2/sales/: a doc do SOP cita /v2/sales/, mas nos hosts cieloecommerce essa rota dá 404
  // (conferido em 26/10/2026 em prod e sandbox; /v2/sales só existe na Braspag, que usa outra credencial).
  const data = await cieloFetch(
    "POST",
    "/1/sales/",
    `${hosts.api}/1/sales/`,
    merchantHeaders(),
    JSON.stringify(body),
    i.merchantOrderId,
  );
  return toSale(data, i.merchantOrderId);
}

export async function getSale(paymentId: string): Promise<CieloSale> {
  const hosts = getHosts(getCieloEnv());
  const data = await cieloFetch(
    "GET",
    "/1/sales/:id",
    `${hosts.query}/1/sales/${encodeURIComponent(paymentId)}`,
    merchantHeaders(),
  );
  return toSale(data);
}

/** Lista vazia → []; erro HTTP/rede/corpo inesperado → throw (nunca "[]" em erro). */
export async function findSalesByMerchantOrderId(id: string): Promise<string[]> {
  const hosts = getHosts(getCieloEnv());
  const data = await cieloFetch(
    "GET",
    "/1/sales?merchantOrderId",
    `${hosts.query}/1/sales?merchantOrderId=${encodeURIComponent(id)}`,
    merchantHeaders(),
    undefined,
    id,
  ) as { Payments?: unknown } | undefined;
  if (!Array.isArray(data?.Payments)) throw new CieloApiError({ code: "cielo_bad_response" });
  return data.Payments.map((p) => str((p as { PaymentId?: unknown })?.PaymentId)).filter((x): x is string => !!x);
}

/** Idempotente: consulta antes; 10 Voided / 11 Refunded → no-op devolvendo a venda atual. */
export async function voidSale(paymentId: string, amountCents: number): Promise<CieloSale> {
  assertCents(amountCents);
  const current = await getSale(paymentId);
  if (current.status === 10 || current.status === 11) return current;
  const hosts = getHosts(getCieloEnv());
  // A resposta do void é plana (sem `Payment`): Status/ReturnCode/ReturnMessage no topo.
  const data = await cieloFetch(
    "PUT",
    "/1/sales/:id/void",
    `${hosts.api}/1/sales/${encodeURIComponent(paymentId)}/void?amount=${amountCents}`,
    merchantHeaders(),
    undefined,
    current.merchantOrderId,
  ) as { Status?: unknown; ReturnCode?: unknown; ReturnMessage?: unknown } | undefined;
  const status = Number(data?.Status);
  if (!Number.isInteger(status)) throw new CieloApiError({ code: "cielo_bad_response" });
  return {
    ...current,
    status,
    returnCode: str(data?.ReturnCode) ?? current.returnCode,
    returnMessage: str(data?.ReturnMessage) ?? current.returnMessage,
  };
}

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

const APPROVED_CODES = new Set(["00", "4", "6"]);

export function isApproved(s: CieloSale): boolean {
  return s.status === 2 && APPROVED_CODES.has(s.returnCode);
}

/** 2 PaymentConfirmed, 3 Denied, 10 Voided, 11 Refunded, 13 Aborted. 0/1/12/desconhecido: NÃO terminal. */
export function isTerminal(status: number): boolean {
  return status === 2 || status === 3 || status === 10 || status === 11 || status === 13;
}

export type CieloReturnKind =
  | "approved"
  | "declined_balance"
  | "declined_card"
  | "declined_password"
  | "declined_function"
  | "retry_later"
  | "merchant_config"
  | "declined_other"
  | "error";

/**
 * Grupos de ReturnCode (docs.cielo.com.br/ecommerce-cielo/page/abecs, tabela Elo + "Outros códigos", lida em 06/11/2026).
 * `merchant_config` = bloqueio do nosso cadastro/terminal na Cielo (o 002 de 04/11): alerta interno, não é culpa do cliente.
 * `retry_later` = emissor/Cielo fora ou timeout: a venda ainda pode finalizar, por isso Status 0 com esses códigos segue pendente.
 */
const RETURN_CODE_GROUPS: ReadonlyArray<[CieloReturnKind, ReadonlySet<string>, string]> = [
  ["declined_balance", new Set(["51", "70", "BL", "DM"]), "Saldo insuficiente no cartão Alelo."],
  [
    "declined_card",
    new Set(["54", "57", "63", "82", "BM", "BN", "78", "12", "13", "14", "15", "19", "41", "43", "46", "56", "58", "FM"]),
    "Cartão inválido, bloqueado ou não autorizado. Confira os dados ou use outro cartão.",
  ],
  ["declined_password", new Set(["55", "75", "83"]), "Dados do cartão incorretos."],
  ["declined_function", new Set(["AB", "AC", "AH", "C1"]), "Esse cartão não aceita pagamento online. Use outro cartão Alelo."],
  // 90 fechamento em andamento, 92 sem rota, 94 duplicidade (pode já existir no emissor), 99 falha de comunicação.
  ["retry_later", new Set(["91", "96", "98", "999", "AA", "89", "BP900", "BP901", "90", "92", "94", "99"]), "Não foi possível processar agora. Tente em alguns minutos."],
  [
    "merchant_config",
    new Set(["002", "003", "GA", "GD", "GF", "GT", "GK", "116"]),
    "Pagamento com Alelo indisponível no momento. Use outra forma de pagamento.",
  ],
];

export function classifyReturnCode(code: string): { kind: CieloReturnKind; userMessage: string } {
  if (APPROVED_CODES.has(code)) return { kind: "approved", userMessage: "Pagamento aprovado." };
  if (!code) return { kind: "error", userMessage: "Não foi possível processar o pagamento agora. Tente novamente em instantes." };
  const hit = RETURN_CODE_GROUPS.find(([, codes]) => codes.has(code.toUpperCase()));
  if (hit) return { kind: hit[0], userMessage: hit[2] };
  return { kind: "declined_other", userMessage: "Pagamento não autorizado. Tente novamente ou use outra forma de pagamento." };
}

// ---------------------------------------------------------------------------
// merchantOrderId
// ---------------------------------------------------------------------------

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** "JA" + 18 alfanuméricos (crypto). ponytail: módulo 62 tem viés desprezível para um id não secreto. */
export function newMerchantOrderId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return "JA" + Array.from(bytes, (b) => ALPHANUM[b % 62]).join("");
}

// ---------------------------------------------------------------------------
// Só para testes
// ---------------------------------------------------------------------------

/** ponytail: reseta cache do bearer e (opcional) encurta o timeout — nunca chamar em produção. */
export function __resetCieloClientForTests(opts: { timeoutMs?: number } = {}): void {
  bearerCache = null;
  timeoutMs = opts.timeoutMs ?? 30_000;
}
