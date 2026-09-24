/**
 * `vr-checkout` — orquestra o pagamento com VR (Vale Refeição) no carrinho:
 * valida sessão/limites/corpo/endereço/cart, garante o PIX5 (G1: VR tem os
 * mesmos 5% do Pix), cria o draft order ANTES de cobrar (auditoria A1),
 * confere o total, cobra na VR e só então completa o pedido. Sequência exata
 * e vocabulário de erros em `.claude/.work/pagamento-vr/plan-03.md`.
 *
 * `handleVrCheckout` recebe as dependências injetadas (`VrCheckoutDeps`) —
 * é assim que o teste roda 100% em memória, sem rede. `buildDefaultDeps()`
 * monta as dependências reais (Supabase + Shopify + VR) e só é usada pelo
 * `serve` real em `./index.ts` (o entrypoint fica separado para que o teste
 * importe este módulo sem abrir porta).
 *
 * Nunca logar: body, cartão criptografado, endereço, email ou CPF. Log só
 * `[vr-checkout] <etapa> <status>` + `id_transacao_van`.
 *
 * ponytail: `cartId` não é verificado como pertencente ao usuário — o cart
 * do Shopify Storefront é anônimo (sem `buyerIdentity`), então qualquer
 * pessoa com o `cartId` de outra pode "pagar" o carrinho dela. Isso não gera
 * ganho para quem ataca: o pedido nasce com o `customerId`/email do JWT de
 * quem chama e o endereço validado como do próprio chamador (risco residual
 * aceito, auditoria B5).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

import { PIX_COUPON_ACTIVE } from "../_shared/pix-coupons.ts";
import { isAreaDeliverable } from "../_shared/delivery-areas.ts";
import { applyDiscountCodes, getCart, type StorefrontCart } from "../_shared/storefront-cart.ts";
import { hasOtherCoupon, hasPixCoupon, validateCartForVr, type VrGateInput, type VrGateResult } from "../_shared/vr-gates.ts";
import {
  classifyReturnCode,
  createPayment,
  getTransaction,
  newIdTransacaoVan,
  refund,
  VrApiError,
  type ConsultaTransacao,
  type TransacaoAutorizada,
  type VrReturnClass,
} from "../_shared/vr-client.ts";
import { completeDraftOrder, createDraftOrder, deleteDraftOrder, type DraftOrderInput } from "../_shared/shopify-draft-order.ts";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const RATE_LIMIT_DECLINES = 5;
const RATE_LIMIT_WINDOW_MIN = 15;
// ponytail: threshold do circuit breaker global — sugestão da auditoria de segurança
// (security.md, A4), a confirmar com o dono do produto antes de produção.
const VR_BREAKER_DECLINES = 30;
const VR_BREAKER_WINDOW_MIN = 10;
// ponytail: janela para considerar uma linha `authorizing` "travada" e tentar
// reconciliar via getTransaction — 5 min dá folga pro timeout de 30s da VR + retries de rede.
const STALE_AUTHORIZING_MIN = 5;

// ---------------------------------------------------------------------------
// Body (zod, strict — campo extra tipo `cartao`/`cpf` vira 400 por construção)
// ---------------------------------------------------------------------------

const CheckoutBodySchema = z
  .object({
    cartId: z.string().startsWith("gid://shopify/Cart/"),
    selectedAddressId: z.string().uuid(),
    deliveryMethod: z.enum(["uber_direct", "jilo_own", "lalamove"]),
    uberQuoteId: z.string().optional(),
    deliveryLabel: z.string().optional(),
    keyId: z.string().min(1).max(64),
    cardEncrypted: z
      .string()
      .max(1024)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, "invalid_base64"),
  })
  .strict();

type CheckoutBody = z.infer<typeof CheckoutBodySchema>;

// ---------------------------------------------------------------------------
// Tipos de dependências (injetadas — é o que torna o handler 100% testável
// em memória, sem rede)
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
}

export interface VrTransactionRow {
  id: string;
  user_id: string;
  cart_id: string;
  id_transacao_van: string;
  vr_id_transacao: string | null;
  vr_codigo_retorno: string | null;
  vr_codigo_autorizacao: string | null;
  valor_cents: number;
  status: string;
  shopify_draft_order_id: string | null;
  shopify_order_id: string | null;
  shopify_order_name: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export type InsertTransactionResult = { ok: true; row: VrTransactionRow } | { ok: false; code: "23505" };

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

export interface VrCheckoutDb {
  insertAuthorizing(input: {
    userId: string;
    cartId: string;
    idTransacaoVan: string;
    valorCents: number;
  }): Promise<InsertTransactionResult>;
  getLiveByCartId(cartId: string): Promise<VrTransactionRow | null>;
  update(id: string, patch: Partial<Omit<VrTransactionRow, "id" | "created_at" | "updated_at">>): Promise<void>;
  countRecentUserDeclinesOrErrors(userId: string, sinceIso: string): Promise<number>;
  countRecentGlobalDeclines(sinceIso: string): Promise<number>;
  getOwnAddress(addressId: string, userId: string): Promise<OwnAddress | null>;
  getShopifyCustomerId(userId: string): Promise<string | null>;
}

export interface VrCheckoutDeps {
  getUser(authHeader: string | null): Promise<AuthUser | null>;
  db: VrCheckoutDb;
  getCart(cartId: string): Promise<StorefrontCart | null>;
  applyDiscountCodes(cartId: string, codes: string[]): Promise<StorefrontCart | null>;
  validateCartForVr(input: VrGateInput): VrGateResult;
  hasPixCoupon(cart: StorefrontCart): boolean;
  hasOtherCoupon(cart: StorefrontCart): boolean;
  isAreaDeliverable(uf: string, city: string): boolean;
  vr: {
    createPayment(params: {
      valorCents: number;
      idTransacaoVan: string;
      keyId: string;
      cardEncrypted: string;
    }): Promise<TransacaoAutorizada>;
    getTransaction(idTransacaoOuVan: string): Promise<ConsultaTransacao>;
    refund(params: { idTransacao: string; valorCents: number }): Promise<{ noop: boolean }>;
    classifyReturnCode(codigo: string): { classe: VrReturnClass; userMessage: string };
    newIdTransacaoVan(): string;
  };
  draft: {
    create(input: DraftOrderInput): Promise<{ id: string; totalPriceCents: number }>;
    complete(draftId: string): Promise<{ orderId: string; orderName: string }>;
    delete(draftId: string): Promise<void>;
  };
  env: {
    VR_ENV: string;
    SHOPIFY_SHIPPING_VARIANT_ID: string | null;
  };
  now(): Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ponytail: allowlist = domínio de produção (src/config/site.ts) + localhost (dev). Não há
// padrão de preview do Lovable documentado no repo (grep nas outras functions só encontrou
// "*"); se precisar liberar preview, adicionar o domínio aqui. Auth é bearer sem cookie, então
// CORS é defesa em profundidade, não a barreira principal (achado B4 em security.md).
function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = origin === "https://jilomarmitas.com" || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://jilomarmitas.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** Erros de shopify-admin-client.ts / shopify-draft-order.ts já são códigos curtos (nunca body). */
function shortErrCode(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 64);
  return "unknown";
}

function splitName(fullName: string | null): { firstName?: string; lastName?: string } {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return {};
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return { firstName: trimmed };
  return { firstName: trimmed.slice(0, spaceIdx), lastName: trimmed.slice(spaceIdx + 1).trim() };
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

/**
 * Resolve uma linha `authorizing` mais velha que STALE_AUTHORIZING_MIN via
 * `getTransaction`. CONFIRMADA ⇒ estorna (dinheiro sem pedido) e sinaliza
 * resposta 409 direta. NEGADA/CANCELADA/erro de lookup ⇒ marca `error` e
 * libera o cart pra nova tentativa (retorna `respond:false`). PENDENTE ⇒ 409
 * direto, sem mexer na linha.
 *
 * ponytail: se a linha velha já tinha `shopify_draft_order_id` (request
 * anterior morreu depois de criar o draft), o draft fica órfão na Shopify —
 * inofensivo (nunca foi pago) e limpável manualmente; não vale a chamada
 * extra pra cobrir esse caso raro aqui.
 */
async function resolveStaleAuthorizing(
  deps: VrCheckoutDeps,
  live: VrTransactionRow,
): Promise<{ respond: true; status: number; body: unknown } | { respond: false }> {
  try {
    const consulta = await deps.vr.getTransaction(live.id_transacao_van);
    if (consulta.status === "CONFIRMADA") {
      try {
        await deps.vr.refund({ idTransacao: consulta.id_transacao, valorCents: live.valor_cents });
        await deps.db.update(live.id, { status: "refunded_auto" });
      } catch {
        await deps.db.update(live.id, { status: "refund_failed", error: "refund_failed:0" });
        console.error(`[vr-checkout] refund_failed ${live.id_transacao_van}`);
      }
      // ponytail: devolve 409 pedindo nova tentativa; a linha velha já saiu do índice
      // (status mudou) — o próximo POST insere de novo sem colidir.
      return {
        respond: true,
        status: 409,
        body: { code: "payment_in_progress", userMessage: "Pagamento anterior expirado. Tente novamente." },
      };
    }
    if (consulta.status === "PENDENTE") {
      return {
        respond: true,
        status: 409,
        body: { code: "payment_in_progress", userMessage: "Pagamento em andamento. Aguarde e tente novamente." },
      };
    }
    // NEGADA / CANCELADA / CANCELAMENTO_PENDENTE: sem cobrança viva, libera o cart.
    await deps.db.update(live.id, { status: "error", error: `vr_stale_${consulta.status.toLowerCase()}:0` });
    return { respond: false };
  } catch {
    console.error(`[vr-checkout] stale_authorizing_lookup_failed ${live.id_transacao_van}`);
    await deps.db.update(live.id, { status: "error", error: "vr_stale_lookup_failed:0" });
    return { respond: false };
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleVrCheckout(req: Request, deps: VrCheckoutDeps): Promise<Response> {
  const cors = buildCorsHeaders(req);

  // 1. CORS / método
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return jsonResponse({ code: "method_not_allowed", userMessage: "Método não permitido." }, 405, cors);
  }

  // 2. JWT
  const user = await deps.getUser(req.headers.get("Authorization"));
  if (!user) {
    return jsonResponse({ code: "unauthorized", userMessage: "Sessão inválida. Faça login novamente." }, 401, cors);
  }

  // 3. Rate limit por usuário + breaker global (baratos, antes de tocar cart/Shopify/VR)
  const now = deps.now();
  const rateLimitSince = new Date(now.getTime() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
  const userDeclines = await deps.db.countRecentUserDeclinesOrErrors(user.id, rateLimitSince);
  if (userDeclines >= RATE_LIMIT_DECLINES) {
    return jsonResponse(
      { code: "too_many_attempts", userMessage: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      429,
      cors,
    );
  }
  const breakerSince = new Date(now.getTime() - VR_BREAKER_WINDOW_MIN * 60_000).toISOString();
  const globalDeclines = await deps.db.countRecentGlobalDeclines(breakerSince);
  if (globalDeclines >= VR_BREAKER_DECLINES) {
    return jsonResponse(
      { code: "vr_unavailable", userMessage: "Pagamento com VR temporariamente indisponível. Tente novamente em instantes." },
      503,
      cors,
    );
  }

  // 4. Body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ code: "invalid_body", userMessage: "Requisição inválida." }, 400, cors);
  }
  const parsed = CheckoutBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse({ code: "invalid_body", userMessage: "Requisição inválida." }, 400, cors);
  }
  const body: CheckoutBody = parsed.data;

  // 5. Endereço: precisa ser do usuário e estar em área atendida
  const address = await deps.db.getOwnAddress(body.selectedAddressId, user.id);
  if (!address) {
    return jsonResponse({ code: "address_forbidden", userMessage: "Endereço inválido." }, 403, cors);
  }
  if (!deps.isAreaDeliverable(address.state, address.city)) {
    return jsonResponse({ code: "address_not_deliverable", userMessage: "Endereço fora da área atendida." }, 422, cors);
  }

  // 6. Cart + garantia do PIX5 (G1: VR tem os mesmos 5% do Pix)
  let cart = await deps.getCart(body.cartId);
  if (!cart) {
    return jsonResponse({ code: "cart_not_found", userMessage: "Carrinho não encontrado." }, 422, cors);
  }
  if (!deps.hasPixCoupon(cart) && !deps.hasOtherCoupon(cart)) {
    cart = await deps.applyDiscountCodes(body.cartId, [PIX_COUPON_ACTIVE]);
    if (!cart) {
      return jsonResponse({ code: "cart_not_found", userMessage: "Carrinho não encontrado." }, 422, cors);
    }
  }

  // 7. Gates de negócio (moeda, quantidade, estrutura de frete, endereço de novo — defesa em profundidade)
  const gate = deps.validateCartForVr({
    cart,
    shippingVariantId: deps.env.SHOPIFY_SHIPPING_VARIANT_ID,
    deliveryMethod: body.deliveryMethod,
    address: { state: address.state, city: address.city },
  });
  if (!gate.ok) {
    return jsonResponse({ code: gate.code, userMessage: gate.userMessage }, gate.status, cors);
  }
  const { valorCents } = gate;

  // 8. INSERT authorizing ANTES de qualquer chamada externa (idempotência — auditoria C1/C2)
  const idTransacaoVan = deps.vr.newIdTransacaoVan();
  const insertResult = await deps.db.insertAuthorizing({ userId: user.id, cartId: body.cartId, idTransacaoVan, valorCents });

  let txId: string;
  if (insertResult.ok) {
    txId = insertResult.row.id;
  } else {
    const live = await deps.db.getLiveByCartId(body.cartId);
    if (live) {
      if (live.status === "approved") {
        return jsonResponse(
          { orderName: live.shopify_order_name, orderId: live.shopify_order_id, idempotent: true },
          200,
          cors,
        );
      }
      // status === "authorizing"
      const ageMin = (now.getTime() - new Date(live.created_at).getTime()) / 60_000;
      if (ageMin < STALE_AUTHORIZING_MIN) {
        return jsonResponse(
          { code: "payment_in_progress", userMessage: "Pagamento em andamento. Aguarde e tente novamente." },
          409,
          cors,
        );
      }
      const resolution = await resolveStaleAuthorizing(deps, live);
      if (resolution.respond) {
        return jsonResponse(resolution.body, resolution.status, cors);
      }
      // liberado (linha antiga marcada error/refunded_auto) — cai para o retry abaixo
    }
    const retryInsert = await deps.db.insertAuthorizing({ userId: user.id, cartId: body.cartId, idTransacaoVan, valorCents });
    if (!retryInsert.ok) {
      return jsonResponse(
        { code: "payment_in_progress", userMessage: "Pagamento em andamento. Aguarde e tente novamente." },
        409,
        cors,
      );
    }
    txId = retryInsert.row.id;
  }

  // 9. Draft order (antes de cobrar — auditoria A1)
  // Todas as alocações (Kit por linha + PIX5/cupom por ordem) viram UM desconto fixo de
  // ordem — o FIXED_AMOUNT por linha da Shopify é por unidade (ver shopify-draft-order.ts).
  const lineDiscountCents = cart.lines.reduce((sum, l) => sum + l.lineDiscountCents, 0);
  const discountCents = lineDiscountCents + cart.orderDiscountCents;
  const applicableCodes = cart.discountCodes.filter((d) => d.applicable).map((d) => d.code);
  const discountTitle = [...(lineDiscountCents > 0 ? ["Kit"] : []), ...applicableCodes].join(" + ") || "VR 5%";
  const customerId = await deps.db.getShopifyCustomerId(user.id);

  const customAttributes: Record<string, string> = {
    selected_address_id: body.selectedAddressId,
    delivery_method: body.deliveryMethod,
    payment_method: "vr",
  };
  // Fora de prod: omite uber_quote_id (o receiver não despacha Uber sem ele) — auditoria A5.
  if (body.uberQuoteId && deps.env.VR_ENV === "prod") customAttributes.uber_quote_id = body.uberQuoteId;
  if (body.deliveryLabel) customAttributes.delivery_label = body.deliveryLabel;

  const draftInput: DraftOrderInput = {
    email: user.email,
    customerId,
    lines: cart.lines.map((line) => ({ variantId: line.merchandiseId, quantity: line.quantity })),
    discountCents,
    discountTitle,
    shippingAddress: buildShippingAddress(address),
    tags: ["vr", ...(deps.env.VR_ENV !== "prod" ? ["vr-test"] : [])],
    customAttributes,
  };

  let draft: { id: string; totalPriceCents: number };
  try {
    draft = await deps.draft.create(draftInput);
  } catch (err) {
    await deps.db.update(txId, { status: "error", error: `shopify_draft_failed:${shortErrCode(err)}` });
    console.error(`[vr-checkout] draft_create_failed ${idTransacaoVan}`);
    return jsonResponse({ code: "order_failed", userMessage: "Não foi possível criar o pedido. Tente novamente." }, 502, cors);
  }
  await deps.db.update(txId, { shopify_draft_order_id: draft.id });

  if (draft.totalPriceCents !== valorCents) {
    await deps.draft.delete(draft.id);
    await deps.db.update(txId, { status: "error", error: "draft_total_mismatch:0" });
    // Valores em centavos, sem PII — é o único jeito de diagnosticar o mismatch sem abrir o draft.
    console.error(`[vr-checkout] draft_total_mismatch ${idTransacaoVan} draft=${draft.totalPriceCents} expected=${valorCents}`);
    return jsonResponse(
      { code: "order_failed", userMessage: "Não foi possível confirmar o valor do pedido. Tente novamente." },
      502,
      cors,
    );
  }

  // 10. Cobrança na VR
  let vrResult: TransacaoAutorizada;
  try {
    vrResult = await deps.vr.createPayment({
      valorCents,
      idTransacaoVan,
      keyId: body.keyId,
      cardEncrypted: body.cardEncrypted,
    });
  } catch (err) {
    if (err instanceof VrApiError && err.code === "vr_timeout") {
      let consulta: ConsultaTransacao | null = null;
      try {
        consulta = await deps.vr.getTransaction(idTransacaoVan);
      } catch {
        console.error(`[vr-checkout] vr_timeout_lookup_failed ${idTransacaoVan}`);
      }
      if (consulta?.status === "CONFIRMADA") {
        vrResult = { id_transacao: consulta.id_transacao, valor: consulta.valor, codigo_retorno: "00" };
      } else if (consulta?.status === "NEGADA") {
        await deps.draft.delete(draft.id);
        await deps.db.update(txId, { status: "declined" });
        console.error(`[vr-checkout] vr_timeout_negada ${idTransacaoVan}`);
        return jsonResponse({ code: "declined", classe: "negado", userMessage: "Pagamento não autorizado pela VR." }, 402, cors);
      } else {
        // PENDENTE, outro status, ou lookup falhou: deixa authorizing (sem tocar no draft) —
        // uma nova tentativa ou reconciliação futura resolve.
        console.error(`[vr-checkout] vr_timeout_unresolved ${idTransacaoVan}`);
        return jsonResponse(
          { code: "payment_in_progress", userMessage: "Aguarde a confirmação do pagamento e tente novamente em instantes." },
          409,
          cors,
        );
      }
    } else {
      const code = err instanceof VrApiError ? err.code : "vr_bad_response";
      const status = err instanceof VrApiError ? err.status ?? 0 : 0;
      await deps.draft.delete(draft.id);
      await deps.db.update(txId, { status: "error", error: `${code}:${status}` });
      console.error(`[vr-checkout] vr_error ${idTransacaoVan}`);
      return jsonResponse(
        { code: "vr_error", userMessage: "Não foi possível processar o pagamento agora. Tente novamente em instantes." },
        502,
        cors,
      );
    }
  }

  await deps.db.update(txId, {
    vr_id_transacao: vrResult.id_transacao,
    vr_codigo_retorno: vrResult.codigo_retorno,
    vr_codigo_autorizacao: vrResult.codigo_autorizacao ?? null,
  });

  if (vrResult.codigo_retorno !== "00") {
    await deps.draft.delete(draft.id);
    await deps.db.update(txId, { status: "declined" });
    const { classe, userMessage } = deps.vr.classifyReturnCode(vrResult.codigo_retorno);
    console.error(`[vr-checkout] declined ${idTransacaoVan}`);
    return jsonResponse({ code: "declined", classe, userMessage }, 402, cors);
  }

  // 11. Complete — guard: só chega aqui com vr_codigo_retorno === '00' já gravado acima.
  try {
    const completed = await deps.draft.complete(draft.id);
    await deps.db.update(txId, {
      status: "approved",
      shopify_order_id: completed.orderId,
      shopify_order_name: completed.orderName,
    });
    console.log(`[vr-checkout] approved ${idTransacaoVan}`);
    return jsonResponse({ orderName: completed.orderName, orderId: completed.orderId }, 200, cors);
  } catch {
    console.error(`[vr-checkout] draft_complete_failed ${idTransacaoVan}`);
    try {
      await deps.vr.refund({ idTransacao: vrResult.id_transacao, valorCents });
      await deps.db.update(txId, { status: "refunded_auto" });
      return jsonResponse(
        { code: "order_failed_refunded", userMessage: "Não foi possível concluir o pedido; o valor foi estornado." },
        502,
        cors,
      );
    } catch {
      await deps.db.update(txId, { status: "refund_failed", error: "refund_failed:0" });
      console.error(`[vr-checkout] refund_failed ${idTransacaoVan}`);
      return jsonResponse(
        { code: "order_failed_refund_failed", userMessage: "Não foi possível concluir o pedido. Entre em contato com o suporte." },
        502,
        cors,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Deps reais (Supabase + Shopify + VR) — só usadas pelo serve() de verdade
// ---------------------------------------------------------------------------

export function buildDefaultDeps(): VrCheckoutDeps {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const db: VrCheckoutDb = {
    async insertAuthorizing({ userId, cartId, idTransacaoVan, valorCents }) {
      const { data, error } = await serviceClient
        .from("vr_transactions")
        .insert({ user_id: userId, cart_id: cartId, id_transacao_van: idTransacaoVan, valor_cents: valorCents, status: "authorizing" })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return { ok: false, code: "23505" };
        throw new Error(`vr_transactions_insert_failed:${error.code ?? "0"}`);
      }
      return { ok: true, row: data as VrTransactionRow };
    },
    async getLiveByCartId(cartId) {
      const { data } = await serviceClient
        .from("vr_transactions")
        .select("*")
        .eq("cart_id", cartId)
        .in("status", ["authorizing", "approved"])
        .maybeSingle();
      return (data as VrTransactionRow | null) ?? null;
    },
    async update(id, patch) {
      const { error } = await serviceClient.from("vr_transactions").update(patch).eq("id", id);
      if (error) console.error(`[vr-checkout] vr_transactions_update_failed ${id}`);
    },
    async countRecentUserDeclinesOrErrors(userId, sinceIso) {
      const { count } = await serviceClient
        .from("vr_transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["declined", "error"])
        .gte("created_at", sinceIso);
      return count ?? 0;
    },
    async countRecentGlobalDeclines(sinceIso) {
      const { count } = await serviceClient
        .from("vr_transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "declined")
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
    vr: { createPayment, getTransaction, refund, classifyReturnCode, newIdTransacaoVan },
    draft: { create: createDraftOrder, complete: completeDraftOrder, delete: deleteDraftOrder },
    env: {
      VR_ENV: Deno.env.get("VR_ENV") ?? "mock",
      SHOPIFY_SHIPPING_VARIANT_ID: Deno.env.get("SHOPIFY_SHIPPING_VARIANT_ID") || null,
    },
    now: () => new Date(),
  };
}

