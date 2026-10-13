/**
 * `getnet-callback` — recebe o GET de callback da Getnet (segredo no path) e, para CARTÃO aprovado
 * com casamento exato, marca o pedido Shopify como pago (`orderMarkAsPaid`). Pix só fica `pending`
 * (o ticket 03 cria o pedido). Contrato: .claude/.work/getnet-callback/tickets/_map.md + security.md.
 *
 * GET /functions/v1/getnet-callback/<segredo>?order_id=&payment_id=&amount=&payment_type=credit|pix&status=
 * Ordem: kill-switch -> método -> segredo (config válida + path exato + PREV) -> query estrita ->
 * INSERT idempotente -> repasse (1ª gravação) -> processamento -> 200.
 *
 * Segurança (security.md): S-01 (config inválida => 404), S-02 (validação + busca por variável + checagem exata),
 * S-03 (teto, recência, breaker/h, estorno após auto-pago, LIVE explícito), S-04.1 (SECRET + SECRET_PREV),
 * S-08 (INSERT falho => 500; conflito => needs_review), S-13 (repasse), S-14 (no-store, sem CORS, sem query => 200),
 * S-16/S-17 (log sem PII; 400 loga só NOMES dos parâmetros).
 * Nunca logar: URL, query, segredo, corpo/mensagem da Shopify, e-mail/CPF/endereço. Log:
 * `[getnet-callback] <etapa> <state> <getnet_payment_id>` (só depois de validado).
 *
 * Alerta de needs_review: neste ticket é `console.error` com prefixo fixo; a linha fica com `alerted_at` null
 * para o Flow/marcador (ticket 04). A rota `POST /reconcile` entra no ticket 02 (dispatch no topo do handler).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { callShopifyAdmin } from "../_shared/shopify-admin-client.ts";

const FN_NAME = "getnet-callback";
const AUTO_PAID_TAG = "getnet-auto-pago";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type PaymentType = "credit" | "pix";
export type CallbackState = "received" | "pending" | "done" | "needs_review" | "ignored" | "error";

export interface CallbackRow {
  id: string;
  getnet_payment_id: string;
  shopify_payment_id: string;
  payment_type: PaymentType;
  status_getnet: string;
  amount_cents: number;
  state: CallbackState;
  attempts: number;
}

export interface NewCallback {
  getnet_payment_id: string;
  shopify_payment_id: string;
  payment_type: PaymentType;
  status_getnet: string;
  amount_cents: number;
}

export type CallbackPatch = Partial<{
  state: CallbackState;
  attempts: number;
  shopify_order_id: string;
  shopify_order_name: string;
  error: string;
  forwarded_at: string;
}>;

export interface ShopifyOrderLite {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string;
  canMarkAsPaid: boolean;
  currencyCode: string;
  totalOutstandingCents: number;
  transactions: { paymentId: string | null; kind: string; status: string; gateway: string | null }[];
}

export interface GetnetCallbackDeps {
  env: {
    GETNET_CALLBACK_ENABLED: string | null;
    GETNET_CALLBACK_LIVE: string | null;
    GETNET_CALLBACK_SECRET: string | null;
    GETNET_CALLBACK_SECRET_PREV: string | null;
    GETNET_AUTOPAY_MAX_CENTS: string | null;
    GETNET_AUTOPAY_RECENCY_MIN: string | null;
    GETNET_AUTOPAY_MAX_PER_HOUR: string | null;
    GETNET_FORWARD_PIX_URL: string | null;
    GETNET_FORWARD_CREDIT_URL: string | null;
  };
  db: {
    /** Lança em erro != 23505 (o handler responde 500, S-08). */
    insert(i: NewCallback): Promise<{ ok: true; row: CallbackRow } | { ok: false; code: "23505" }>;
    getByKey(getnetPaymentId: string, statusGetnet: string): Promise<CallbackRow | null>;
    /** Já existe APPROVED `done` para esse payment_id? (estorno após auto-pago, S-03.5). Lança em erro (fail-closed). */
    hasPaidApproval(getnetPaymentId: string): Promise<boolean>;
    /** Breaker (S-03.3): linhas credit + done com updated_at > since. Lança em erro (fail-closed). */
    countPaidSince(sinceIso: string): Promise<number>;
    update(id: string, patch: CallbackPatch): Promise<void>;
  };
  shopify: {
    /** `orders(query: $q)` por variável GraphQL; lança Error curto em falha. */
    findOrders(paymentId: string): Promise<ShopifyOrderLite[]>;
    /** ok=false quando a mutation devolve userErrors (o texto nunca sai do adapter). */
    markAsPaid(orderId: string): Promise<{ ok: boolean }>;
    addTag(orderId: string, tag: string): Promise<void>;
  };
  /** GET no destino (já validado) com timeout 5 s, sem headers; true = a Getnet respondeu < 400. */
  forward(url: string): Promise<boolean>;
  /** `EdgeRuntime.waitUntil` quando existir; o repasse nunca bloqueia a resposta. */
  waitUntil(p: Promise<unknown>): void;
  now(): Date;
}

// ---------------------------------------------------------------------------
// Auth (S-01 / S-04.1)
// ---------------------------------------------------------------------------

const SECRET_RE = /^[A-Za-z0-9_-]{32,}$/;

/**
 * Comparação em tempo constante via SHA-256 (tamanho fixo => sem vazar comprimento).
 * ponytail: cópia de `cielo-reconcile/handler.ts:49-57` (função de função deployada, não mexo nela);
 * a rota /reconcile do ticket 02 mora neste mesmo arquivo. Extrair para `_shared` se um 3º arquivo precisar.
 */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Segmento logo após o nome da função; exatamente 1 (vazio permitido aqui — nunca casa com segredo válido). */
function secretSegment(pathname: string): string | null {
  const segs = pathname.split("/");
  const i = segs.indexOf(FN_NAME);
  return i === -1 || segs.length !== i + 2 ? null : segs[i + 1];
}

// ---------------------------------------------------------------------------
// Respostas (S-14): no-store, sem CORS, 404 uniforme
// ---------------------------------------------------------------------------

const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const notFound = () => respond({ code: "not_found" }, 404);
const ok = () => respond({ ok: true }, 200);

// ---------------------------------------------------------------------------
// Validação de entrada (S-02)
// ---------------------------------------------------------------------------

const KEYS = ["order_id", "payment_id", "amount", "payment_type", "status"] as const;
type Key = (typeof KEYS)[number];

const ORDER_ID_RE = /^[A-Za-z0-9]{10,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMOUNT_RE = /^[1-9]\d{0,8}$/;
/**
 * Formato, não allow-list: os status do Pix nunca foram vistos, e um status desconhecido rejeitado com 400
 * perderia o registro do pagamento. Só APPROVED paga; qualquer outro vira `ignored` (ou needs_review se já auto-pago).
 */
const STATUS_RE = /^[A-Z_]{2,30}$/;

interface Callback {
  orderId: string; // cru: o paymentId da Shopify é case-sensitive
  paymentId: string; // UUID em minúsculas (chave de dedupe)
  amountCents: number;
  paymentType: PaymentType;
  status: string; // MAIÚSCULAS
  raw: Record<Key, string>; // valores originais (já validados), só para o repasse
}

type Parsed = { kind: "empty" } | { kind: "invalid"; names: Key[]; amountShape?: string } | { kind: "ok"; cb: Callback };

/** Formato do `amount` sem o valor (S-17): dígito=9, letra=a, só `.`/`,` sobrevivem; máx. 12 caracteres. */
const shape = (v: string) => v.slice(0, 12).replace(/\d/g, "9").replace(/[A-Za-z]/g, "a").replace(/[^9a.,]/g, "?");

function parseQuery(params: URLSearchParams): Parsed {
  // Chaves desconhecidas são ignoradas (a Getnet pode acrescentar campos); nomes delas nunca são logados.
  if (!KEYS.some((k) => params.has(k))) return { kind: "empty" };
  const raw = {} as Record<Key, string>;
  const names: Key[] = [];
  for (const k of KEYS) {
    const all = params.getAll(k);
    if (all.length === 1) raw[k] = all[0];
    else names.push(k); // ausente ou repetida
  }
  const check = (k: Key, valid: boolean) => {
    if (k in raw && !valid) names.push(k);
  };
  check("order_id", ORDER_ID_RE.test(raw.order_id ?? ""));
  check("payment_id", UUID_RE.test(raw.payment_id ?? ""));
  check("amount", AMOUNT_RE.test(raw.amount ?? ""));
  check("payment_type", raw.payment_type === "credit" || raw.payment_type === "pix");
  const status = (raw.status ?? "").toUpperCase();
  check("status", STATUS_RE.test(status));
  if (names.length > 0) {
    return { kind: "invalid", names, amountShape: names.includes("amount") && raw.amount !== undefined ? shape(raw.amount) : undefined };
  }
  return {
    kind: "ok",
    cb: {
      orderId: raw.order_id,
      paymentId: raw.payment_id.toLowerCase(),
      amountCents: Number(raw.amount),
      paymentType: raw.payment_type as PaymentType,
      status,
      raw,
    },
  };
}

// ---------------------------------------------------------------------------
// Limites de auto-pagamento (S-03) — decididos pelo dono em 13/10
// ---------------------------------------------------------------------------

/** ponytail: defaults = valores do dono (R$ 600 / 30 min / 10 por hora); env sobrescreve. Inválido => default, nunca "sem limite". */
const intOr = (raw: string | null, dflt: number) => {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : dflt;
};

// ---------------------------------------------------------------------------
// Casamento com o pedido Shopify (S-02.3) — função pura
// ---------------------------------------------------------------------------

export type Match =
  | { kind: "not_found" }
  | { kind: "review"; code: string }
  | { kind: "paid"; order: ShopifyOrderLite }
  | { kind: "ok"; order: ShopifyOrderLite };

export function evaluateOrders(orders: ShopifyOrderLite[], cb: Pick<Callback, "orderId" | "amountCents">): Match {
  const review = (code: string): Match => ({ kind: "review", code });
  if (orders.length === 0) return { kind: "not_found" };
  if (orders.length > 1) return review("order_ambiguous");
  const o = orders[0];
  // Não confiar na busca: o paymentId tem que ser IGUAL ao order_id (a busca da Shopify é por "contém"/curinga).
  const tx = o.transactions.find((t) => t.paymentId === cb.orderId);
  if (!tx) return review("payment_id_mismatch");
  if (!/getnet/i.test(tx.gateway ?? "")) return review("gateway_mismatch");
  if (tx.kind !== "SALE") return review("kind_mismatch");
  if (o.cancelledAt) return review("order_cancelled");
  if (o.currencyCode !== "BRL") return review("currency_mismatch");
  if (o.displayFinancialStatus === "PAID") return { kind: "paid", order: o };
  if (o.displayFinancialStatus !== "PENDING" && o.displayFinancialStatus !== "EXPIRED") return review("status_not_payable");
  if (!o.canMarkAsPaid) return review("cannot_mark_paid");
  if (o.totalOutstandingCents !== cb.amountCents) return review("amount_mismatch");
  return { kind: "ok", order: o };
}

// ---------------------------------------------------------------------------
// Repasse (S-13) — best-effort, nunca bloqueia
// ---------------------------------------------------------------------------

/** ponytail: sufixos aceitos para o destino do repasse (Getnet / herokuapp informado pela Getnet); ampliar só por decisão do dono. */
const FORWARD_HOST_SUFFIXES = ["getnet.com.br", "herokuapp.com"];

function forwardTarget(base: string, raw: Record<Key, string>): string | null {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (!FORWARD_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) return null;
  u.hash = "";
  for (const k of KEYS) u.searchParams.set(k, raw[k]); // query reserializada a partir dos 5 parâmetros validados, sem o segredo
  return u.toString();
}

async function forwardCallback(row: CallbackRow, cb: Callback, deps: GetnetCallbackDeps): Promise<void> {
  const base = cb.paymentType === "credit" ? deps.env.GETNET_FORWARD_CREDIT_URL : deps.env.GETNET_FORWARD_PIX_URL;
  if (!base) return;
  try {
    const target = forwardTarget(base, cb.raw);
    if (!target) {
      console.error(`[getnet-callback] forward_url_invalid ${row.state} ${cb.paymentId}`);
      return;
    }
    if (await deps.forward(target)) await deps.db.update(row.id, { forwarded_at: deps.now().toISOString() });
  } catch {
    console.error(`[getnet-callback] forward_failed ${row.state} ${cb.paymentId}`);
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGetnetCallback(req: Request, deps: GetnetCallbackDeps): Promise<Response> {
  const env = deps.env;
  // 1. Kill-switch e método (só GET aqui; POST /reconcile entra no ticket 02) — antes de tudo, 404 uniforme
  if (env.GETNET_CALLBACK_ENABLED !== "true" || req.method !== "GET") return notFound();

  // 2. Path exato + segredo. Config inválida => 404 (S-01): nunca compara contra segredo ausente/curto.
  const url = new URL(req.url);
  const segment = secretSegment(url.pathname);
  if (segment === null) return notFound();
  const secret = env.GETNET_CALLBACK_SECRET;
  if (!secret || !SECRET_RE.test(secret)) {
    console.error("[getnet-callback] config_invalid 404 -");
    return notFound();
  }
  // PREV (rotação sem parada, S-04.1): inválido/ausente é só excluído. Compara os dois sem curto-circuito.
  const prev = env.GETNET_CALLBACK_SECRET_PREV;
  const candidates = prev && SECRET_RE.test(prev) ? [secret, prev] : [secret];
  const matches = await Promise.all(candidates.map((c) => safeEqual(segment, c)));
  if (!matches.some(Boolean)) return notFound();

  // 3. Query estrita (S-02). Sem nenhum parâmetro conhecido => 200 sem efeito (S-14).
  const parsed = parseQuery(url.searchParams);
  if (parsed.kind === "empty") return ok();
  if (parsed.kind === "invalid") {
    console.error(`[getnet-callback] bad_request 400 invalid=${parsed.names.join(",")}${parsed.amountShape ? ` amount_shape=${parsed.amountShape}` : ""}`);
    return respond({ code: "invalid_request" }, 400);
  }
  const cb = parsed.cb;
  const receivedAt = deps.now();

  // 4. INSERT primeiro (idempotência). Falha != 23505 => 500 para a Getnet reenviar (S-08).
  let ins: Awaited<ReturnType<GetnetCallbackDeps["db"]["insert"]>>;
  try {
    ins = await deps.db.insert({
      getnet_payment_id: cb.paymentId,
      shopify_payment_id: cb.orderId,
      payment_type: cb.paymentType,
      status_getnet: cb.status,
      amount_cents: cb.amountCents,
    });
  } catch {
    console.error(`[getnet-callback] insert_failed 500 ${cb.paymentId}`);
    return respond({ code: "internal_error" }, 500);
  }

  // Daqui em diante a linha existe: nada lança para a Getnet (200 sempre). O que falhar fica reprocessável.
  try {
    if (!ins.ok) {
      await handleDuplicate(cb, deps);
    } else {
      deps.waitUntil(forwardCallback(ins.row, cb, deps)); // só na 1ª gravação (S-13)
      await processCallback(ins.row, cb, receivedAt, deps);
    }
  } catch {
    console.error(`[getnet-callback] process_failed - ${cb.paymentId}`);
  }
  return ok();
}

/** 23505: já recebido. Dados diferentes na mesma chave (S-08) => callback_conflict, sem rebaixar linha `done`. */
async function handleDuplicate(cb: Callback, deps: GetnetCallbackDeps): Promise<void> {
  const existing = await deps.db.getByKey(cb.paymentId, cb.status);
  if (!existing) return;
  const same = existing.shopify_payment_id === cb.orderId && existing.amount_cents === cb.amountCents && existing.payment_type === cb.paymentType;
  if (same) {
    console.log(`[getnet-callback] duplicate ${existing.state} ${cb.paymentId}`);
    return;
  }
  console.error(`[getnet-callback] callback_conflict ${existing.state} ${cb.paymentId}`);
  // `done` não rebaixa (a detecção de estorno depende dele); `needs_review` já está sinalizado.
  if (existing.state === "done" || existing.state === "needs_review") return;
  await deps.db.update(existing.id, { state: "needs_review", error: "callback_conflict" });
}

async function processCallback(row: CallbackRow, cb: Callback, receivedAt: Date, deps: GetnetCallbackDeps): Promise<void> {
  const finish = async (state: CallbackState, etapa: string, patch: CallbackPatch = {}) => {
    await deps.db.update(row.id, { state, ...patch });
    (state === "needs_review" ? console.error : console.log)(`[getnet-callback] ${etapa} ${state} ${cb.paymentId}`);
  };
  const review = (code: string) => finish("needs_review", code, { error: code });
  const done = (etapa: string, o: ShopifyOrderLite) => finish("done", etapa, { shopify_order_id: o.id, shopify_order_name: o.name });
  const retryLater = (etapa: string, error: string) => finish("pending", etapa, { attempts: row.attempts + 1, error });

  try {
    // Estorno/chargeback de um pagamento que já auto-pagamos não pode sumir em `ignored` (S-03.5).
    if (cb.status !== "APPROVED") {
      if (await deps.db.hasPaidApproval(cb.paymentId)) return await review("refund_after_paid");
      return await finish("ignored", "status_not_approved");
    }
    // Pix: o pedido nasce no ticket 03; aqui só fica registrado.
    if (cb.paymentType === "pix") return await finish("pending", "pix_pending");

    const match = async () => evaluateOrders(await deps.shopify.findOrders(cb.orderId), cb);
    const m = await match();
    if (m.kind === "not_found") return await retryLater("order_not_found", "order_not_found");
    if (m.kind === "review") return await review(m.code);
    if (m.kind === "paid") return await done("already_paid", m.order);

    // Gates de dano (S-03): teto, recência, breaker. Qualquer falha => humano.
    const maxCents = intOr(deps.env.GETNET_AUTOPAY_MAX_CENTS, 60_000);
    const recencyMin = intOr(deps.env.GETNET_AUTOPAY_RECENCY_MIN, 30);
    const maxPerHour = intOr(deps.env.GETNET_AUTOPAY_MAX_PER_HOUR, 10);
    if (m.order.totalOutstandingCents > maxCents) return await review("above_cap");
    const ageMs = receivedAt.getTime() - Date.parse(m.order.createdAt);
    if (!(ageMs <= recencyMin * 60_000)) return await review("outside_recency"); // NaN também cai aqui
    // ponytail: leitura-depois-escrita; callbacks concorrentes podem ultrapassar o limite em poucas unidades. Aceito (limite é freio, não cota).
    const since = new Date(receivedAt.getTime() - 3_600_000).toISOString();
    if ((await deps.db.countPaidSince(since)) >= maxPerHour) return await review("breaker_open");

    // Dry-run (S-03.4): só muta com LIVE=true. Os gates acima já rodaram, então o log mostra a decisão real.
    // Estado `pending` + error=dry_run: o reconcile (ticket 02) pode reavaliar quando LIVE ligar.
    if (deps.env.GETNET_CALLBACK_LIVE !== "true") return await retryLater("dry_run", "dry_run");

    // Reconsulta imediatamente antes de mutar: já pago => done sem mutar; qualquer outra mudança => humano.
    const fresh = await match();
    if (fresh.kind === "paid") return await done("already_paid", fresh.order);
    if (fresh.kind === "not_found") return await review("order_changed");
    if (fresh.kind === "review") return await review(fresh.code);

    const res = await deps.shopify.markAsPaid(fresh.order.id);
    if (!res.ok) {
      // userError (ex.: "cannot be marked as paid"): se já está pago, é sucesso; senão humano.
      const again = await match();
      if (again.kind === "paid") return await done("already_paid", again.order);
      return await review("mark_paid_failed");
    }
    try {
      await deps.shopify.addTag(fresh.order.id, AUTO_PAID_TAG); // best-effort
    } catch {
      console.error(`[getnet-callback] tag_failed - ${cb.paymentId}`);
    }
    return await done("auto_paid", fresh.order);
  } catch (err) {
    // Falha transitória (Shopify/DB): a linha continua reprocessável. Só códigos curtos internos vão para `error`.
    const code = err instanceof Error && /^[a-z0-9_:]{1,60}$/.test(err.message) ? err.message : "unexpected_error";
    await deps.db.update(row.id, { state: "pending", attempts: row.attempts + 1, error: code });
    console.error(`[getnet-callback] transient_error pending ${cb.paymentId}`);
  }
}

// ---------------------------------------------------------------------------
// Deps reais
// ---------------------------------------------------------------------------

const FIND_ORDERS = `query($q: String!) {
  orders(first: 3, query: $q) {
    nodes {
      id name createdAt cancelledAt displayFinancialStatus canMarkAsPaid currencyCode
      totalOutstandingSet { shopMoney { amount } }
      transactions(first: 10) { paymentId kind status gateway }
    }
  }
}`;
const MARK_PAID = `mutation($input: OrderMarkAsPaidInput!) {
  orderMarkAsPaid(input: $input) { userErrors { field message } }
}`;
const TAGS_ADD = `mutation($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
}`;

interface RawOrder {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string;
  canMarkAsPaid: boolean;
  currencyCode: string;
  totalOutstandingSet: { shopMoney: { amount: string } };
  transactions: ShopifyOrderLite["transactions"];
}

export function buildDefaultDeps(): GetnetCallbackDeps {
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const T = "getnet_callbacks";
  const e = (k: string) => Deno.env.get(k) ?? null;

  return {
    env: {
      GETNET_CALLBACK_ENABLED: e("GETNET_CALLBACK_ENABLED"),
      GETNET_CALLBACK_LIVE: e("GETNET_CALLBACK_LIVE"),
      GETNET_CALLBACK_SECRET: e("GETNET_CALLBACK_SECRET"),
      GETNET_CALLBACK_SECRET_PREV: e("GETNET_CALLBACK_SECRET_PREV"),
      GETNET_AUTOPAY_MAX_CENTS: e("GETNET_AUTOPAY_MAX_CENTS"),
      GETNET_AUTOPAY_RECENCY_MIN: e("GETNET_AUTOPAY_RECENCY_MIN"),
      GETNET_AUTOPAY_MAX_PER_HOUR: e("GETNET_AUTOPAY_MAX_PER_HOUR"),
      GETNET_FORWARD_PIX_URL: e("GETNET_FORWARD_PIX_URL"),
      GETNET_FORWARD_CREDIT_URL: e("GETNET_FORWARD_CREDIT_URL"),
    },
    db: {
      async insert(i) {
        const { data, error } = await client.from(T).insert(i).select().single();
        if (error) {
          if (error.code === "23505") return { ok: false, code: "23505" };
          throw new Error(`getnet_callbacks_insert_failed:${error.code ?? "0"}`);
        }
        return { ok: true, row: data as CallbackRow };
      },
      async getByKey(getnetPaymentId, statusGetnet) {
        const { data } = await client.from(T).select("*").eq("getnet_payment_id", getnetPaymentId).eq("status_getnet", statusGetnet).maybeSingle();
        return (data as CallbackRow | null) ?? null;
      },
      async hasPaidApproval(getnetPaymentId) {
        const { count, error } = await client
          .from(T)
          .select("id", { count: "exact", head: true })
          .eq("getnet_payment_id", getnetPaymentId)
          .eq("status_getnet", "APPROVED")
          .eq("state", "done");
        if (error) throw new Error("getnet_callbacks_count_failed");
        return (count ?? 0) > 0;
      },
      async countPaidSince(sinceIso) {
        const { count, error } = await client
          .from(T)
          .select("id", { count: "exact", head: true })
          .eq("payment_type", "credit")
          .eq("state", "done")
          .gt("updated_at", sinceIso);
        if (error) throw new Error("getnet_callbacks_count_failed"); // fail-closed: erro nunca vira "0 auto-pagos"
        return count ?? 0;
      },
      async update(id, patch) {
        const { error } = await client.from(T).update(patch).eq("id", id);
        if (error) console.error(`[getnet-callback] update_failed - ${id}`);
      },
    },
    shopify: {
      async findOrders(paymentId) {
        const data = await callShopifyAdmin<{ orders: { nodes: RawOrder[] } }>(FIND_ORDERS, { q: `payment_id:${paymentId}` });
        return data.orders.nodes.map((o) => ({
          id: o.id,
          name: o.name,
          createdAt: o.createdAt,
          cancelledAt: o.cancelledAt,
          displayFinancialStatus: o.displayFinancialStatus,
          canMarkAsPaid: o.canMarkAsPaid,
          currencyCode: o.currencyCode,
          totalOutstandingCents: Math.round(parseFloat(o.totalOutstandingSet.shopMoney.amount) * 100), // NaN nunca casa com amount
          transactions: o.transactions,
        }));
      },
      async markAsPaid(orderId) {
        const data = await callShopifyAdmin<{ orderMarkAsPaid: { userErrors: unknown[] } | null }>(MARK_PAID, { input: { id: orderId } });
        const errs = data.orderMarkAsPaid?.userErrors;
        return { ok: Array.isArray(errs) && errs.length === 0 }; // texto de userErrors pode ter PII: não sai daqui
      },
      async addTag(orderId, tag) {
        await callShopifyAdmin(TAGS_ADD, { id: orderId, tags: [tag] });
      },
    },
    async forward(url) {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      await res.body?.cancel(); // nunca ler/logar o corpo
      return res.status < 400;
    },
    waitUntil(p) {
      const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(p);
      // ponytail: fora do Edge Runtime (deno serve local) a promise segue solta; ela nunca rejeita (forwardCallback captura tudo).
    },
    now: () => new Date(),
  };
}
