/**
 * `cielo-checkout` — Alelo via API Cielo no carrinho. Molde: `vr-checkout/handler.ts`.
 * Ordem: kill-switch -> CORS/método -> JWT -> allowlist QA (não-prod) -> rate limit/breaker
 * -> body (zod strict) -> CPF/endereço -> cart + PIX5 -> gates -> INSERT authorizing
 * -> draft + assert total -> Cielo -> assert valor -> complete.
 *
 * Segurança (security.md): H1 (pós-POST ambíguo nunca libera o cart), H2 (alerta sem PII),
 * H3 (checa o draft antes de anular), H4 (kill-switch/allowlist), M2/M3/M7.
 * Nunca logar: body, paymentToken, holder, CPF, endereço, e-mail. Log só
 * `[cielo-checkout] <etapa> <status> <merchantOrderId>`; `error` no banco = código interno.
 *
 * ponytail: `cartId` não é verificado como do usuário (cart Storefront é anônimo) — risco B5 do VR aceito.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

import { PIX_COUPON_ACTIVE } from "../_shared/pix-coupons.ts";
import { isAreaDeliverable } from "../_shared/delivery-areas.ts";
import { applyDiscountCodes, getCart, type StorefrontCart } from "../_shared/storefront-cart.ts";
import { hasOtherCoupon, hasPixCoupon, validateCartForVr, type VrGateInput, type VrGateResult } from "../_shared/vr-gates.ts";
import {
  CieloApiError,
  classifyReturnCode,
  createVoucherSale,
  findSalesByMerchantOrderId,
  getCieloEnv,
  getSale,
  newMerchantOrderId,
  voidSale,
  type CieloEnv,
  type CieloReturnKind,
  type CieloSale,
} from "../_shared/cielo-client.ts";
import { completeDraftOrder, createDraftOrder, deleteDraftOrder, type DraftOrderInput } from "../_shared/shopify-draft-order.ts";
import { isValidCpf } from "../_shared/cpf.ts";
import {
  buildCorsHeaders,
  classifySale,
  defaultSendAlert,
  errorResponse,
  findIdsOrEmpty,
  getDraftOrderStatus,
  passesQaGate,
  jsonResponse,
  SAFE_RELEASE_MIN,
  type DraftStatus,
  type SendAlert,
} from "../_shared/cielo-support.ts";

const RATE_LIMIT_DECLINES = 5;
const RATE_LIMIT_WINDOW_MIN = 15;
// ponytail: threshold do breaker (a confirmar com o dono); upgrade path: Turnstile no dialog (security.md M3).
const BREAKER_DECLINES = 30;
const BREAKER_WINDOW_MIN = 10;
// M3: `error` = `${code}:${status}` (ex.: cielo_http_400:400); `*` é o wildcard do like no PostgREST.
const CARD_FAILURE_FILTER = "status.eq.declined,and(status.eq.error,error.like.cielo_http_4*)";

const CheckoutBodySchema = z
  .object({
    cartId: z.string().startsWith("gid://shopify/Cart/"),
    addressId: z.string().uuid(),
    deliveryMethod: z.enum(["uber_direct", "jilo_own", "lalamove"]),
    // ponytail: opcionais herdados do vr-checkout (o receiver só despacha Uber com quote); sem amount/brand/installments.
    uberQuoteId: z.string().max(128).optional(),
    deliveryLabel: z.string().max(128).optional(),
    cpf: z.string().regex(/^\d{11}$/),
    holderName: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(/^[\p{L} .'-]+$/u),
    paymentToken: z.string().regex(/^[A-Za-z0-9-]{16,64}$/),
  })
  .strict();

export interface AuthUser {
  id: string;
  email: string;
}

export interface CieloTransactionRow {
  id: string;
  user_id: string | null;
  cart_id: string;
  merchant_order_id: string;
  cielo_env: string;
  cielo_payment_id: string | null;
  cielo_status: number | null;
  cielo_return_code: string | null;
  cielo_authorization_code: string | null;
  cielo_tid: string | null;
  cielo_proof_of_sale: string | null;
  valor_cents: number;
  status: string;
  shopify_draft_order_id: string | null;
  shopify_order_id: string | null;
  shopify_order_name: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export type InsertTransactionResult = { ok: true; row: CieloTransactionRow } | { ok: false; code: "23505" };

export interface OwnAddress {
  id: string;
  state: string;
  city: string;
  recipientName: string | null;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  cep: string;
}

export interface CieloCheckoutDb {
  insertAuthorizing(input: {
    userId: string;
    cartId: string;
    merchantOrderId: string;
    valorCents: number;
    cieloEnv: CieloEnv;
  }): Promise<InsertTransactionResult>;
  getLiveByCartId(cartId: string): Promise<CieloTransactionRow | null>;
  update(id: string, patch: Partial<Omit<CieloTransactionRow, "id" | "created_at" | "updated_at">>): Promise<void>;
  /** M3: `declined` + erro 4xx definitivo do Cielo, por ambiente — erros nossos (5xx/timeout/shopify_*) não contam. */
  countRecentUserDeclines(userId: string, cieloEnv: CieloEnv, sinceIso: string): Promise<number>;
  countRecentEnvDeclines(cieloEnv: CieloEnv, sinceIso: string): Promise<number>;
  getOwnAddress(addressId: string, userId: string): Promise<OwnAddress | null>;
  getShopifyCustomerId(userId: string): Promise<string | null>;
}

export interface CieloCheckoutDeps {
  getUser(authHeader: string | null): Promise<AuthUser | null>;
  db: CieloCheckoutDb;
  getCart(cartId: string): Promise<StorefrontCart | null>;
  applyDiscountCodes(cartId: string, codes: string[]): Promise<StorefrontCart | null>;
  validateCartForVr(input: VrGateInput): VrGateResult;
  hasPixCoupon(cart: StorefrontCart): boolean;
  hasOtherCoupon(cart: StorefrontCart): boolean;
  isAreaDeliverable(uf: string, city: string): boolean;
  cielo: {
    createVoucherSale(i: { merchantOrderId: string; amountCents: number; paymentToken: string; holderName: string }): Promise<CieloSale>;
    getSale(paymentId: string): Promise<CieloSale>;
    findSalesByMerchantOrderId(id: string): Promise<string[]>;
    voidSale(paymentId: string, amountCents: number): Promise<CieloSale>;
    classifyReturnCode(code: string): { kind: CieloReturnKind; userMessage: string };
    newMerchantOrderId(): string;
  };
  draft: {
    create(input: DraftOrderInput): Promise<{ id: string; totalPriceCents: number }>;
    complete(draftId: string): Promise<{ orderId: string; orderName: string }>;
    delete(draftId: string): Promise<void>;
    getStatus(draftId: string): Promise<DraftStatus>;
  };
  sendAlert: SendAlert;
  /** Lazy: kill-switch precisa responder 404 antes de qualquer falha de CIELO_ENV. Lança se inválido. */
  cieloEnv(): CieloEnv;
  env: {
    ALELO_ENABLED: string | null;
    ALELO_QA_EMAILS: string | null;
    SHOPIFY_SHIPPING_VARIANT_ID: string | null;
  };
  now(): Date;
}

function splitName(fullName: string | null): { firstName?: string; lastName?: string } {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return {};
  const i = trimmed.indexOf(" ");
  if (i === -1) return { firstName: trimmed };
  return { firstName: trimmed.slice(0, i), lastName: trimmed.slice(i + 1).trim() };
}

function buildShippingAddress(address: OwnAddress): DraftOrderInput["shippingAddress"] {
  const { firstName, lastName } = splitName(address.recipientName);
  return {
    firstName,
    lastName,
    address1: [address.street, address.number].filter(Boolean).join(", "),
    address2: [address.complement, address.neighborhood].filter(Boolean).join(" - ") || undefined,
    city: address.city,
    provinceCode: address.state.trim().toUpperCase(),
    zip: address.cep,
    countryCode: "BR",
  };
}

/** Erro do POST que NÃO prova que a cobrança não existe (timeout/rede/5xx/resposta ilegível) — H1. */
function isAmbiguous(err: unknown): boolean {
  if (!(err instanceof CieloApiError)) return true;
  return err.code === "cielo_timeout" || err.code === "cielo_bad_response" || /^cielo_http_5/.test(err.code) || err.status === undefined || err.status >= 500;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleCieloCheckout(req: Request, deps: CieloCheckoutDeps): Promise<Response> {
  const cors = buildCorsHeaders(req);

  // 1. Kill-switch (H4) — default desligado
  if (deps.env.ALELO_ENABLED !== "true") {
    return errorResponse("not_found", "Não encontrado.", 404, cors);
  }

  // 2. CORS / método
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", "Método não permitido.", 405, cors);

  // 3. JWT
  const user = await deps.getUser(req.headers.get("Authorization"));
  if (!user) return errorResponse("unauthorized", "Sessão inválida. Faça login novamente.", 401, cors);

  // 4. Ambiente + allowlist fora de prod (H4)
  let cieloEnv: CieloEnv;
  try {
    cieloEnv = deps.cieloEnv();
  } catch {
    console.error("[cielo-checkout] env_invalid");
    return errorResponse("alelo_unavailable", "Pagamento com Alelo indisponível.", 503, cors);
  }
  if (!passesQaGate(cieloEnv, user.email, deps.env.ALELO_QA_EMAILS)) {
    return errorResponse("forbidden", "Acesso negado.", 403, cors);
  }

  // 5. Rate limit por usuário + breaker por ambiente (M3: só recusas de cartão)
  const now = deps.now();
  const userSince = new Date(now.getTime() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
  if ((await deps.db.countRecentUserDeclines(user.id, cieloEnv, userSince)) >= RATE_LIMIT_DECLINES) {
    return errorResponse("too_many_attempts", "Muitas tentativas. Aguarde alguns minutos e tente novamente.", 429, cors);
  }
  const breakerSince = new Date(now.getTime() - BREAKER_WINDOW_MIN * 60_000).toISOString();
  if ((await deps.db.countRecentEnvDeclines(cieloEnv, breakerSince)) >= BREAKER_DECLINES) {
    return errorResponse("alelo_unavailable", "Pagamento com Alelo temporariamente indisponível. Tente novamente em instantes.", 503, cors);
  }

  // 6. Body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse("invalid_body", "Requisição inválida.", 400, cors);
  }
  const parsed = CheckoutBodySchema.safeParse(rawBody);
  if (!parsed.success) return errorResponse("invalid_body", "Requisição inválida.", 400, cors);
  const body = parsed.data;
  if (!isValidCpf(body.cpf)) return errorResponse("invalid_cpf", "CPF inválido.", 422, cors);

  // 7. Endereço do usuário em área atendida
  const address = await deps.db.getOwnAddress(body.addressId, user.id);
  if (!address) return errorResponse("address_forbidden", "Endereço inválido.", 403, cors);
  if (!deps.isAreaDeliverable(address.state, address.city)) {
    return errorResponse("address_not_deliverable", "Endereço fora da área atendida.", 422, cors);
  }

  // 8. Cart + PIX5 (R-A2)
  let cart = await deps.getCart(body.cartId);
  if (!cart) return errorResponse("cart_not_found", "Carrinho não encontrado.", 422, cors);
  if (!deps.hasPixCoupon(cart) && !deps.hasOtherCoupon(cart)) {
    cart = await deps.applyDiscountCodes(body.cartId, [PIX_COUPON_ACTIVE]);
    if (!cart) return errorResponse("cart_not_found", "Carrinho não encontrado.", 422, cors);
  }

  // 9. Gates (valor vem SEMPRE do servidor — M2)
  const gate = deps.validateCartForVr({
    cart,
    shippingVariantId: deps.env.SHOPIFY_SHIPPING_VARIANT_ID,
    deliveryMethod: body.deliveryMethod,
    address: { state: address.state, city: address.city },
  });
  if (!gate.ok) return jsonResponse({ code: gate.code, message: gate.userMessage, userMessage: gate.userMessage }, gate.status, cors);
  const { valorCents } = gate;

  // 10. INSERT authorizing antes de qualquer chamada externa (idempotência — R-A6)
  let merchantOrderId = deps.cielo.newMerchantOrderId();
  let insert = await deps.db.insertAuthorizing({ userId: user.id, cartId: body.cartId, merchantOrderId, valorCents, cieloEnv });
  if (!insert.ok) {
    const live = await deps.db.getLiveByCartId(body.cartId);
    if (live?.status === "approved" && live.user_id === user.id) {
      return jsonResponse({ orderName: live.shopify_order_name, orderId: live.shopify_order_id, idempotent: true }, 200, cors);
    }
    // M5: approved de outro usuário => 409 genérico (não vaza orderName/orderId)
    if (live?.status === "approved") {
      return errorResponse("payment_in_progress", "Pagamento em andamento. Aguarde e tente novamente.", 409, cors);
    }
    if (live?.status === "void_failed") {
      return errorResponse("payment_blocked", "Houve um problema com este pagamento. Fale com o suporte.", 409, cors);
    }
    const inProgress = errorResponse("payment_in_progress", "Pagamento em andamento. Aguarde e tente novamente.", 409, cors);
    if (!live) return inProgress; // índice disse que existe mas sumiu (corrida): não cobra, pede nova tentativa
    const ageMin = (now.getTime() - new Date(live.created_at).getTime()) / 60_000;
    if (ageMin < SAFE_RELEASE_MIN) return inProgress;
    // H1: só libera se a consulta responder LISTA VAZIA; consulta falhou/achou algo => segue authorizing (reconcile resolve)
    let ids: string[];
    try {
      ids = await findIdsOrEmpty(deps.cielo.findSalesByMerchantOrderId, live.merchant_order_id);
    } catch {
      console.error(`[cielo-checkout] stale_lookup_failed failed ${live.merchant_order_id}`);
      return inProgress;
    }
    if (ids.length > 0) return inProgress;
    await deps.db.update(live.id, { status: "error", error: "cielo_stale_empty:0" });
    if (live.shopify_draft_order_id) await deps.draft.delete(live.shopify_draft_order_id);
    merchantOrderId = deps.cielo.newMerchantOrderId();
    insert = await deps.db.insertAuthorizing({ userId: user.id, cartId: body.cartId, merchantOrderId, valorCents, cieloEnv });
    if (!insert.ok) return inProgress;
  }
  const txId = insert.row.id;
  const log = (step: string, status: string) => console.log(`[cielo-checkout] ${step} ${status} ${merchantOrderId}`);
  const logErr = (step: string, status: string) => console.error(`[cielo-checkout] ${step} ${status} ${merchantOrderId}`);
  const alert = async (event: string, status?: string) => {
    try {
      await deps.sendAlert({ merchantOrderId, event, status });
    } catch {
      /* alerta nunca derruba o fluxo */
    }
  };

  // 11. Draft order (antes de cobrar) — descontos viram UM desconto fixo de ordem (ver vr-checkout)
  const lineDiscountCents = cart.lines.reduce((sum, l) => sum + l.lineDiscountCents, 0);
  const discountCents = lineDiscountCents + cart.orderDiscountCents;
  const applicableCodes = cart.discountCodes.filter((d) => d.applicable).map((d) => d.code);
  const discountTitle = [...(lineDiscountCents > 0 ? ["Kit"] : []), ...applicableCodes].join(" + ") || "Alelo 5%";
  const customerId = await deps.db.getShopifyCustomerId(user.id);

  const customAttributes: Record<string, string> = {
    selected_address_id: body.addressId,
    delivery_method: body.deliveryMethod,
    payment_method: "alelo",
  };
  // Fora de prod: omite uber_quote_id (receiver não despacha Uber sem ele).
  if (body.uberQuoteId && cieloEnv === "prod") customAttributes.uber_quote_id = body.uberQuoteId;
  if (body.deliveryLabel) customAttributes.delivery_label = body.deliveryLabel;

  let draft: { id: string; totalPriceCents: number };
  try {
    draft = await deps.draft.create({
      email: user.email,
      customerId,
      lines: cart.lines.map((line) => ({ variantId: line.merchandiseId, quantity: line.quantity })),
      discountCents,
      discountTitle,
      shippingAddress: buildShippingAddress(address),
      tags: ["alelo", ...(cieloEnv !== "prod" ? ["alelo-test"] : [])],
      customAttributes,
      cpf: body.cpf, // vai só ao draft (localizedFields); nunca persistido/logado
    });
  } catch {
    await deps.db.update(txId, { status: "error", error: "shopify_draft_failed:0" });
    logErr("draft_create", "failed");
    return errorResponse("order_failed", "Não foi possível criar o pedido. Tente novamente.", 502, cors);
  }
  await deps.db.update(txId, { shopify_draft_order_id: draft.id });
  if (draft.totalPriceCents !== valorCents) {
    await deps.draft.delete(draft.id);
    await deps.db.update(txId, { status: "error", error: "draft_total_mismatch:0" });
    logErr("draft_total_mismatch", `draft=${draft.totalPriceCents} expected=${valorCents}`);
    return errorResponse("order_failed", "Não foi possível confirmar o valor do pedido. Tente novamente.", 502, cors);
  }
  const draftId = draft.id;

  // --- desfechos -------------------------------------------------------------
  const pendingMsg = "Estamos confirmando seu pagamento. Não pague de novo; avisaremos em instantes.";
  const pending = (): Response => {
    logErr("payment", "pending");
    return jsonResponse({ code: "payment_pending", message: pendingMsg, userMessage: pendingMsg }, 202, cors);
  };

  const declined = async (sale: CieloSale): Promise<Response> => {
    await deps.draft.delete(draftId);
    await deps.db.update(txId, { status: "declined" });
    const { kind, userMessage } = deps.cielo.classifyReturnCode(sale.returnCode);
    logErr("payment", "declined");
    // nunca devolve returnCode/returnMessage brutos
    return jsonResponse({ code: "declined", classe: kind, message: userMessage, userMessage }, 402, cors);
  };

  /** H3: tenta complete, confere o draft entre tentativas. "unknown" = não conseguiu consultar => não anula. */
  const completeWithRecovery = async (): Promise<{ order: { id: string; name: string } } | "open" | "unknown"> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const c = await deps.draft.complete(draftId);
        return { order: { id: c.orderId, name: c.orderName } };
      } catch {
        logErr("draft_complete", "failed");
      }
      try {
        const st = await deps.draft.getStatus(draftId);
        if (st.status === "COMPLETED" && st.order) return { order: st.order };
      } catch {
        return "unknown";
      }
    }
    return "open";
  };

  const voidAndRespond = async (sale: CieloSale, reason: string): Promise<Response> => {
    try {
      await deps.cielo.voidSale(sale.paymentId, sale.amountCents);
    } catch {
      await deps.db.update(txId, { status: "void_failed", error: "void_failed:0" });
      logErr("void", "void_failed");
      await alert("void_failed", "void_failed");
      return errorResponse("order_failed_refund_failed", "Não foi possível concluir o pedido. Entre em contato com o suporte.", 502, cors);
    }
    // B1: estorno feito; falha no resto é best-effort (nunca marca void_failed)
    try {
      await deps.draft.delete(draftId);
    } catch {
      logErr("void_draft_delete", "failed");
    }
    await deps.db.update(txId, { status: "voided_auto", error: reason });
    log("void", "voided_auto");
    return errorResponse("order_failed_refunded", "Não foi possível concluir o pedido; o valor foi estornado.", 502, cors);
  };

  const approve = async (sale: CieloSale): Promise<Response> => {
    if (sale.amountCents !== valorCents) {
      logErr("amount_mismatch", `cielo=${sale.amountCents} expected=${valorCents}`);
      return await voidAndRespond(sale, "cielo_amount_mismatch:0");
    }
    const r = await completeWithRecovery();
    if (r === "unknown") {
      // não sabemos se virou pedido: não anula; reconcile resolve
      await alert("complete_unknown", "authorizing");
      return pending();
    }
    if (r === "open") return await voidAndRespond(sale, "draft_complete_failed:0");
    await deps.db.update(txId, { status: "approved", shopify_order_id: r.order.id, shopify_order_name: r.order.name });
    log("payment", "approved");
    return jsonResponse({ orderName: r.order.name, orderId: r.order.id }, 200, cors);
  };

  const settle = async (sale: CieloSale): Promise<Response> => {
    // breadcrumb ANTES do complete (H1.4)
    await deps.db.update(txId, {
      cielo_payment_id: sale.paymentId,
      cielo_status: sale.status,
      cielo_return_code: sale.returnCode,
      cielo_authorization_code: sale.authorizationCode ?? null,
      cielo_tid: sale.tid ?? null,
      cielo_proof_of_sale: sale.proofOfSale ?? null,
    });
    const kind = classifySale(sale);
    if (kind === "approved") return await approve(sale);
    if (kind === "declined") return await declined(sale);
    return pending(); // 0/1/12/10/11/desconhecido: reconcile resolve
  };

  // 12. Cobrança
  let sale: CieloSale;
  try {
    sale = await deps.cielo.createVoucherSale({ merchantOrderId, amountCents: valorCents, paymentToken: body.paymentToken, holderName: body.holderName });
  } catch (err) {
    if (isAmbiguous(err)) {
      // H1: NÃO libera. Consulta; se achar 1 venda, resolve; vazio/falha => segue authorizing (reconcile libera após SAFE_RELEASE_MIN).
      // ponytail: dentro do request a idade é ~0, então nunca liberamos aqui; a liberação é do cielo-reconcile/próximo POST.
      try {
        const ids = await deps.cielo.findSalesByMerchantOrderId(merchantOrderId);
        if (ids.length === 1) return await settle(await deps.cielo.getSale(ids[0]));
      } catch {
        logErr("lookup", "failed");
      }
      return pending();
    }
    const code = err instanceof CieloApiError ? err.code : "cielo_error";
    const status = err instanceof CieloApiError ? err.status ?? 0 : 0;
    await deps.draft.delete(draftId);
    await deps.db.update(txId, { status: "error", error: `${code}:${status}` });
    logErr("payment", "error");
    return errorResponse("alelo_error", "Não foi possível processar o pagamento agora. Tente novamente em instantes.", 502, cors);
  }
  return await settle(sale);
}

// ---------------------------------------------------------------------------
// Deps reais
// ---------------------------------------------------------------------------

export function buildDefaultDeps(): CieloCheckoutDeps {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const db: CieloCheckoutDb = {
    async insertAuthorizing({ userId, cartId, merchantOrderId, valorCents, cieloEnv }) {
      const { data, error } = await serviceClient
        .from("cielo_transactions")
        .insert({ user_id: userId, cart_id: cartId, merchant_order_id: merchantOrderId, cielo_env: cieloEnv, valor_cents: valorCents, status: "authorizing" })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return { ok: false, code: "23505" };
        throw new Error(`cielo_transactions_insert_failed:${error.code ?? "0"}`);
      }
      return { ok: true, row: data as CieloTransactionRow };
    },
    async getLiveByCartId(cartId) {
      const { data } = await serviceClient
        .from("cielo_transactions")
        .select("*")
        .eq("cart_id", cartId)
        .in("status", ["authorizing", "approved", "void_failed"])
        .maybeSingle();
      return (data as CieloTransactionRow | null) ?? null;
    },
    async update(id, patch) {
      const { error } = await serviceClient.from("cielo_transactions").update(patch).eq("id", id);
      if (error) console.error(`[cielo-checkout] update_failed failed ${id}`);
    },
    async countRecentUserDeclines(userId, cieloEnv, sinceIso) {
      const { count } = await serviceClient
        .from("cielo_transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("cielo_env", cieloEnv)
        .or(CARD_FAILURE_FILTER)
        .gte("created_at", sinceIso);
      return count ?? 0;
    },
    async countRecentEnvDeclines(cieloEnv, sinceIso) {
      const { count } = await serviceClient
        .from("cielo_transactions")
        .select("id", { count: "exact", head: true })
        .eq("cielo_env", cieloEnv)
        .or(CARD_FAILURE_FILTER)
        .gte("created_at", sinceIso);
      return count ?? 0;
    },
    async getOwnAddress(addressId, userId) {
      const { data } = await serviceClient
        .from("addresses")
        .select("id, state, city, recipient_name, street, number, complement, neighborhood, cep")
        .eq("id", addressId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        state: data.state,
        city: data.city,
        recipientName: data.recipient_name,
        street: data.street,
        number: data.number,
        complement: data.complement,
        neighborhood: data.neighborhood,
        cep: data.cep,
      };
    },
    async getShopifyCustomerId(userId) {
      const { data } = await serviceClient.from("profiles").select("shopify_customer_id").eq("id", userId).maybeSingle();
      return data?.shopify_customer_id ?? null;
    },
  };

  return {
    async getUser(authHeader) {
      if (!authHeader) return null;
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      if (error || !user || !user.email) return null;
      return { id: user.id, email: user.email };
    },
    db,
    getCart,
    applyDiscountCodes,
    validateCartForVr,
    hasPixCoupon,
    hasOtherCoupon,
    isAreaDeliverable,
    cielo: { createVoucherSale, getSale, findSalesByMerchantOrderId, voidSale, classifyReturnCode, newMerchantOrderId },
    draft: { create: createDraftOrder, complete: completeDraftOrder, delete: deleteDraftOrder, getStatus: getDraftOrderStatus },
    sendAlert: defaultSendAlert,
    cieloEnv: getCieloEnv,
    env: {
      ALELO_ENABLED: Deno.env.get("ALELO_ENABLED") ?? null,
      ALELO_QA_EMAILS: Deno.env.get("ALELO_QA_EMAILS") ?? null,
      SHOPIFY_SHIPPING_VARIANT_ID: Deno.env.get("SHOPIFY_SHIPPING_VARIANT_ID") || null,
    },
    now: () => new Date(),
  };
}
