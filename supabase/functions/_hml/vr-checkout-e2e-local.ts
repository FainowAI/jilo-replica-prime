/**
 * E2E LOCAL do pagamento VR — roda o handler REAL (`handleVrCheckout` +
 * `buildDefaultDeps()`) na máquina, contra Shopify e Supabase REAIS, com a
 * API da VR substituída por uma VR FALSA em processo (`./fake-vr.ts`).
 * NENHUMA cobrança real acontece (a VR nunca é chamada de verdade). Cria
 * ~5 pedidos reais de teste na loja (tag `vr-test`) e os cancela
 * automaticamente ao final — autorizado explicitamente pelo dono do produto
 * em 2026-09-25.
 *
 * Uso:
 *   npx -y deno run --allow-net --allow-env --allow-read --allow-write \
 *     --env-file=.env.vr-e2e supabase/functions/_hml/vr-checkout-e2e-local.ts \
 *     [--only <cenario>] [--keep]
 *
 * `--only <cenario>`: roda um único cenário (nomes: aprovado_7_jilo_own,
 * aprovado_14_kit_pix5, aprovado_menos7_uber_direct, recusa_saldo,
 * recusa_cartao_expirado, duplo_clique, falha_complete_estorno,
 * timeout_reconciliado, endereco_fora_area, endereco_alheio).
 * `--keep`: não roda a limpeza (pedidos/drafts/endereço temporário ficam).
 *
 * Guardas (falham antes de qualquer chamada externa): VR_ENV precisa ser
 * "mock"; SUPABASE_SERVICE_ROLE_KEY precisa estar preenchida.
 *
 * Nunca logar: PAN, CVV, CPF, nome do titular, blob cifrado, JWT ou a
 * service key. Log = passos, códigos de resposta e ids não sensíveis.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptCard as encryptCardFront } from "../../../src/lib/vr/rsa.ts";
import { handleVrCheckout, buildDefaultDeps, type VrCheckoutDeps } from "../vr-checkout/handler.ts";
import { getPublicKey } from "../_shared/vr-client.ts";
import { getCart } from "../_shared/storefront-cart.ts";
import { deleteDraftOrder } from "../_shared/shopify-draft-order.ts";
import { callShopifyAdmin } from "../_shared/shopify-admin-client.ts";
import { getShopifyAdminToken } from "../_shared/shopify-admin-auth.ts";
import { createFakeVr, type FakeVr, type FakeVrOutcome } from "./fake-vr.ts";

// ---------------------------------------------------------------------------
// Fatos fixos do QA (verificados ao vivo em 2026-09-25 — ver brief da track)
// ---------------------------------------------------------------------------

const QA_EMAIL = "qa-vr@jilomarmitas.com";
const QA_USER_ID = "39a3ef0b-fc4f-4b89-9228-137568f90722";
const QA_ADDRESS_ID_SJC = "7431f1f6-c9df-463f-8728-0bf6f80e02b9"; // default, São José dos Campos/SP

// Storefront: mesmo domínio/versão hardcoded em ../_shared/storefront-cart.ts.
const STOREFRONT_DOMAIN = "jnutg9-u2.myshopify.com";
const STOREFRONT_API_VERSION = "2025-07";

const VARIANTS = [
  "gid://shopify/ProductVariant/46458669629580",
  "gid://shopify/ProductVariant/46458670809228",
  "gid://shopify/ProductVariant/46458670874764",
  "gid://shopify/ProductVariant/46458670973068",
  "gid://shopify/ProductVariant/46458671169676",
  "gid://shopify/ProductVariant/46458671431820",
];

const RATE_LIMIT_SAFETY_MARGIN = 3; // recusa/erro pré-existente que deixaria pouca margem para os 2 declines do run (limite real: 5/15min)

// ---------------------------------------------------------------------------
// Helpers genéricos
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function futureAAMM(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 3);
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}${mm}`;
}

// CPF de teste válido (dígitos verificadores corretos), cartão e nome fictícios.
const TEST_CARD = {
  nome: "QA VR TESTE",
  numero_cartao: "4111111111111111",
  data_expiracao: futureAAMM(),
  cvv: "123",
  documento: "52998224725",
};

// ---------------------------------------------------------------------------
// Interceptor de fetch — instalado ANTES de qualquer client/chamada real
// ---------------------------------------------------------------------------

interface Injector {
  failNextComplete: boolean;
}

function installFetchInterceptor(fakeVr: FakeVr, injector: Injector): void {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;

    const fake = fakeVr.handle(url, init);
    if (fake) return await fake;

    if (
      injector.failNextComplete &&
      url.includes("/admin/api/") &&
      typeof init?.body === "string" &&
      init.body.includes("draftOrderComplete")
    ) {
      injector.failNextComplete = false;
      console.log("[e2e] injetando falha sintética em draftOrderComplete");
      return new Response(
        JSON.stringify({
          data: { draftOrderComplete: { draftOrder: null, userErrors: [{ field: null, message: "injected failure" }] } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const res = await realFetch(input as RequestInfo, init);
    // Diagnóstico: o helper de produção só loga a CONTAGEM de userErrors; aqui logamos a mensagem
    // (texto da Shopify, sem PII) para achar a causa raiz de falhas reais no draftOrderCreate/Complete.
    if (url.includes("/admin/api/") && typeof init?.body === "string" && /draftOrder(Create|Complete)/.test(init.body)) {
      try {
        const j = await res.clone().json();
        const d = j?.data ?? {};
        const ue = [...(d.draftOrderCreate?.userErrors ?? []), ...(d.draftOrderComplete?.userErrors ?? [])];
        if (ue.length > 0 || j?.errors) {
          console.log(`[e2e][diag] shopify ${/draftOrderComplete/.test(init.body) ? "complete" : "create"} userErrors=${JSON.stringify(ue)} errors=${JSON.stringify(j?.errors ?? null)}`);
        }
      } catch { /* diagnóstico best-effort */ }
    }
    return res;
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------
// Storefront (cartCreate inline — storefront-cart.ts só tem getCart/applyDiscountCodes)
// ---------------------------------------------------------------------------

async function storefrontRequest(query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = Deno.env.get("SHOPIFY_STOREFRONT_TOKEN");
  if (!token) throw new Error("SHOPIFY_STOREFRONT_TOKEN ausente");
  const res = await fetch(`https://${STOREFRONT_DOMAIN}/api/${STOREFRONT_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`storefront_http_${res.status}`);
  const json = (await res.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
  if (json.errors && json.errors.length > 0) throw new Error(`storefront_graphql_error: ${JSON.stringify(json.errors)}`);
  return json.data ?? {};
}

const CART_CREATE_MUTATION = `
  mutation CartCreateE2E($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) {
      cart { id }
      userErrors { field message }
    }
  }
`;

async function createCart(lines: { merchandiseId: string; quantity: number }[]): Promise<string> {
  const data = await storefrontRequest(CART_CREATE_MUTATION, { lines });
  const cartCreate = data.cartCreate as { cart?: { id: string }; userErrors?: { field?: string[]; message: string }[] };
  const userErrors = cartCreate?.userErrors ?? [];
  if (userErrors.length > 0) throw new Error(`cartCreate userErrors: ${JSON.stringify(userErrors)}`);
  const id = cartCreate?.cart?.id;
  if (!id) throw new Error("cartCreate sem cart.id");
  return id;
}

const VARIANTS_AVAILABILITY_QUERY = `
  query VariantsAvailabilityE2E($ids: [ID!]!) {
    nodes(ids: $ids) { ... on ProductVariant { id availableForSale } }
  }
`;

async function checkVariantsAvailable(ids: string[]): Promise<string[]> {
  const data = await storefrontRequest(VARIANTS_AVAILABILITY_QUERY, { ids });
  const nodes = (data.nodes as ({ id: string; availableForSale: boolean } | null)[]) ?? [];
  return nodes
    .map((n, i) => (!n || n.availableForSale === false ? ids[i] : null))
    .filter((x): x is string => x !== null);
}

// ---------------------------------------------------------------------------
// Admin GraphQL (queries próprias do harness; mutações de escrita reaproveitam
// callShopifyAdmin de _shared/shopify-admin-client.ts para retry/token cache)
// ---------------------------------------------------------------------------

interface AdminOrder {
  id: string;
  name: string;
  tags: string[];
  displayFinancialStatus: string;
  email: string;
  totalPriceSet: { shopMoney: { amount: string } };
  customAttributes: { key: string; value: string }[];
}

const ORDER_QUERY = `
  query OrderCheckE2E($id: ID!) {
    order(id: $id) {
      id name tags displayFinancialStatus email
      totalPriceSet { shopMoney { amount } }
      customAttributes { key value }
    }
  }
`;

async function fetchOrder(orderId: string): Promise<AdminOrder | null> {
  const data = await callShopifyAdmin<{ order: AdminOrder | null }>(ORDER_QUERY, { id: orderId });
  return data.order;
}

const DRAFT_ORDER_QUERY = `query DraftCheckE2E($id: ID!) { draftOrder(id: $id) { id } }`;

async function fetchDraft(draftId: string): Promise<{ id: string } | null> {
  const data = await callShopifyAdmin<{ draftOrder: { id: string } | null }>(DRAFT_ORDER_QUERY, { id: draftId });
  return data.draftOrder;
}

const ORDER_CANCEL_MUTATION = `
  mutation OrderCancelE2E(
    $orderId: ID!
    $reason: OrderCancelReason!
    $restock: Boolean!
    $notifyCustomer: Boolean
    $staffNote: String
    $refundMethod: OrderCancelRefundMethodInput!
  ) {
    orderCancel(
      orderId: $orderId
      reason: $reason
      restock: $restock
      notifyCustomer: $notifyCustomer
      staffNote: $staffNote
      refundMethod: $refundMethod
    ) {
      job { id done }
      orderCancelUserErrors { field message code }
      userErrors { field message }
    }
  }
`;

// Fallback para API versions que não aceitam `refundMethod` (achado a confirmar ao vivo).
const ORDER_CANCEL_MUTATION_FALLBACK = `
  mutation OrderCancelE2EFallback(
    $orderId: ID!
    $reason: OrderCancelReason!
    $restock: Boolean!
    $notifyCustomer: Boolean
    $staffNote: String
    $refund: Boolean
  ) {
    orderCancel(
      orderId: $orderId
      reason: $reason
      restock: $restock
      notifyCustomer: $notifyCustomer
      staffNote: $staffNote
      refund: $refund
    ) {
      job { id done }
      orderCancelUserErrors { field message code }
      userErrors { field message }
    }
  }
`;

interface OrderCancelResponse {
  orderCancel?: {
    job?: { id: string; done: boolean } | null;
    orderCancelUserErrors?: { field?: string[]; message: string; code?: string }[];
    userErrors?: { field?: string[]; message: string }[];
  };
}

async function cancelOrder(orderId: string): Promise<{ ok: boolean; detail: string }> {
  const staffNote = "Teste E2E VR (VR falsa) — cancelado automaticamente";
  try {
    const data = await callShopifyAdmin<OrderCancelResponse>(ORDER_CANCEL_MUTATION, {
      orderId,
      reason: "OTHER",
      restock: true,
      notifyCustomer: false,
      staffNote,
      refundMethod: { originalPaymentMethodsRefund: false },
    });
    const errs = [...(data.orderCancel?.orderCancelUserErrors ?? []), ...(data.orderCancel?.userErrors ?? [])];
    if (errs.length > 0) return { ok: false, detail: `orderCancel userErrors: ${errs.map((e) => e.message).join("; ")}` };
    return { ok: true, detail: `job=${data.orderCancel?.job?.id ?? "?"} (refundMethod)` };
  } catch (err) {
    try {
      const data = await callShopifyAdmin<OrderCancelResponse>(ORDER_CANCEL_MUTATION_FALLBACK, {
        orderId,
        reason: "OTHER",
        restock: true,
        notifyCustomer: false,
        staffNote,
        refund: false,
      });
      const errs = [...(data.orderCancel?.orderCancelUserErrors ?? []), ...(data.orderCancel?.userErrors ?? [])];
      if (errs.length > 0) return { ok: false, detail: `orderCancel(refund) userErrors: ${errs.map((e) => e.message).join("; ")}` };
      return { ok: true, detail: `job=${data.orderCancel?.job?.id ?? "?"} (refund:false)` };
    } catch (err2) {
      return { ok: false, detail: `orderCancel falhou nos dois formatos: ${shortErr(err)} / ${shortErr(err2)}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Auth do QA sem senha (magic link) — service client gera, anon client verifica
// ---------------------------------------------------------------------------

async function getQaJwt(serviceClient: SupabaseClient, anonClient: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await serviceClient.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) throw new Error(`generateLink falhou: ${error?.message ?? "sem hashed_token"}`);

  let verify = await anonClient.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (verify.error) {
    verify = await anonClient.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  }
  const accessToken = verify.data?.session?.access_token;
  if (verify.error || !accessToken) throw new Error(`verifyOtp falhou: ${verify.error?.message ?? "sem session"}`);
  return accessToken;
}

async function buildCardEncrypted(): Promise<{ keyId: string; cardEncrypted: string }> {
  const { key_id, public_key } = await getPublicKey();
  const cardEncrypted = await encryptCardFront(public_key, {
    nome: TEST_CARD.nome,
    numero_cartao: TEST_CARD.numero_cartao,
    data_expiracao: TEST_CARD.data_expiracao,
    cvv: TEST_CARD.cvv,
    documento: TEST_CARD.documento,
  });
  return { keyId: key_id, cardEncrypted };
}

function buildRequest(jwt: string, body: Record<string, unknown>): Request {
  return new Request("http://localhost/vr-checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, Origin: "http://localhost:5173", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function pollOrdersRow(
  serviceClient: SupabaseClient,
  shopifyOrderId: string,
  opts: { timeoutMs: number; predicate?: (row: any) => boolean },
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await serviceClient.from("orders").select("*").eq("shopify_order_id", shopifyOrderId).maybeSingle();
    if (data && (!opts.predicate || opts.predicate(data))) return data;
    await sleep(3000);
  }
  return null;
}

async function checkCustomerOrdersLists(ctx: Ctx, orderName: string): Promise<boolean> {
  const numberNoHash = orderName.replace(/^#/, "");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${ctx.supabaseUrl}/functions/v1/customer-orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ctx.jwt}`, apikey: ctx.anonKey, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const json = (await res.json()) as { orders?: { shopify_order_number: string }[] };
        if ((json.orders ?? []).some((o) => o.shopify_order_number === numberNoHash)) return true;
      }
    } catch {
      // tenta de novo até o deadline — índice de busca da Shopify por email pode atrasar
    }
    await sleep(3000);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

interface Ctx {
  serviceClient: SupabaseClient;
  jwt: string;
  keyId: string;
  cardEncrypted: string;
  cpf: string;
  deps: VrCheckoutDeps;
  fakeVr: FakeVr;
  injector: Injector;
  addressId: string;
  qaUserId: string;
  supabaseUrl: string;
  anonKey: string;
}

interface ScenarioCheck {
  label: string;
  pass: boolean;
  detail?: string;
}

interface ScenarioResult {
  name: string;
  expected: string;
  obtained: string;
  checks: ScenarioCheck[];
  ok: boolean;
  orderName?: string;
  vrTransactionId?: string;
  cents?: Record<string, number | undefined>;
  padding?: string;
}

function check(label: string, pass: boolean, detail?: string): ScenarioCheck {
  return { label, pass, detail };
}

async function runApprovedFlowScenario(
  ctx: Ctx,
  name: string,
  lines: { merchandiseId: string; quantity: number }[],
  bodyExtra: Record<string, unknown>,
): Promise<{ result: ScenarioResult; orderIdGid?: string }> {
  const checks: ScenarioCheck[] = [];
  const paymentsBefore = ctx.fakeVr.state.payments.length;
  try {
    const cartId = await createCart(lines);
    const body = { cartId, selectedAddressId: ctx.addressId, keyId: ctx.keyId, cardEncrypted: ctx.cardEncrypted, cpf: ctx.cpf, ...bodyExtra };
    const res = await handleVrCheckout(buildRequest(ctx.jwt, body), ctx.deps);
    const json = await res.json();
    checks.push(check("status 200", res.status === 200, `status=${res.status} body=${JSON.stringify(json)}`));
    if (res.status !== 200) {
      return { result: { name, expected: "200", obtained: String(res.status), checks, ok: false } };
    }

    const orderName = json.orderName as string;
    const orderIdGid = json.orderId as string;

    checks.push(check("fake recebeu exatamente 1 pagamento", ctx.fakeVr.state.payments.length - paymentsBefore === 1));
    const fakePayment = ctx.fakeVr.state.payments[ctx.fakeVr.state.payments.length - 1];

    const cartAfter = await getCart(cartId);
    const cartTotal = cartAfter?.totalAmountCents;

    const order = await fetchOrder(orderIdGid);
    const orderTotalCents = order ? Math.round(parseFloat(order.totalPriceSet.shopMoney.amount) * 100) : undefined;
    const tags = order?.tags ?? [];
    checks.push(check("tags contem vr e vr-test", tags.includes("vr") && tags.includes("vr-test"), JSON.stringify(tags)));

    const attrs = Object.fromEntries((order?.customAttributes ?? []).map((a) => [a.key, a.value]));
    checks.push(check("sem uber_quote_id em customAttributes (fora de prod)", attrs.uber_quote_id === undefined));
    checks.push(
      check(
        "customAttributes selected_address_id/delivery_method/payment_method",
        attrs.selected_address_id === ctx.addressId &&
          attrs.delivery_method === bodyExtra.deliveryMethod &&
          attrs.payment_method === "vr",
        JSON.stringify(attrs),
      ),
    );

    const { data: txRow } = await ctx.serviceClient.from("vr_transactions").select("*").eq("cart_id", cartId).maybeSingle();
    checks.push(
      check(
        "vr_transactions status approved com shopify_order_name",
        txRow?.status === "approved" && txRow?.shopify_order_name === orderName,
        JSON.stringify({ status: txRow?.status, shopify_order_name: txRow?.shopify_order_name }),
      ),
    );

    const ordersRow = await pollOrdersRow(ctx.serviceClient, orderIdGid, {
      timeoutMs: 90_000,
      predicate: (r) => r.payment_method === "vr" && r.payment_status === "paid",
    });
    checks.push(check("orders: aparece com payment_method=vr payment_status=paid (poll ate 90s)", !!ordersRow));
    if (ordersRow) {
      checks.push(
        check(
          "orders.total_cents == valor cobrado na VR falsa",
          ordersRow.total_cents === fakePayment?.valor,
          `orders=${ordersRow.total_cents} fake=${fakePayment?.valor}`,
        ),
      );
      const { count } = await ctx.serviceClient
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("order_id", ordersRow.id);
      checks.push(check("order_items > 0", (count ?? 0) > 0, `count=${count}`));
    }

    const listed = await checkCustomerOrdersLists(ctx, orderName);
    checks.push(check("customer-orders (deployado) lista o orderName", listed));

    const result: ScenarioResult = {
      name,
      expected: "200",
      obtained: "200",
      checks,
      ok: checks.every((c) => c.pass),
      orderName,
      vrTransactionId: txRow?.id,
      cents: { cart: cartTotal, fake: fakePayment?.valor, shopify: orderTotalCents, orders: ordersRow?.total_cents },
      padding: fakePayment?.padding,
    };
    return { result, orderIdGid };
  } catch (err) {
    checks.push(check("execucao sem excecao", false, shortErr(err)));
    return { result: { name, expected: "200", obtained: "erro", checks, ok: false } };
  }
}

async function scenarioMenos7UberDirect(ctx: Ctx): Promise<ScenarioResult> {
  const name = "aprovado_menos7_uber_direct";
  const shippingVariantId = Deno.env.get("SHOPIFY_SHIPPING_VARIANT_ID");
  if (!shippingVariantId) {
    return { name, expected: "200", obtained: "erro", checks: [check("SHOPIFY_SHIPPING_VARIANT_ID configurado", false)], ok: false };
  }
  const { result, orderIdGid } = await runApprovedFlowScenario(
    ctx,
    name,
    [
      { merchandiseId: VARIANTS[2], quantity: 3 },
      { merchandiseId: shippingVariantId, quantity: 1 },
    ],
    { deliveryMethod: "uber_direct", uberQuoteId: "fake-quote-e2e" },
  );
  if (orderIdGid) {
    const ordersRow = await pollOrdersRow(ctx.serviceClient, orderIdGid, { timeoutMs: 90_000 });
    result.checks.push(
      check("orders.uber_quote_id nulo (mock nao envia p/ Shopify)", ordersRow?.uber_quote_id == null, JSON.stringify(ordersRow?.uber_quote_id)),
    );
    result.checks.push(check("orders.uber_delivery_id nulo", ordersRow?.uber_delivery_id == null, JSON.stringify(ordersRow?.uber_delivery_id)));
    result.ok = result.checks.every((c) => c.pass);
  }
  return result;
}

async function runDeclineScenario(ctx: Ctx, name: string, outcome: FakeVrOutcome, expectedClasse: string): Promise<ScenarioResult> {
  const checks: ScenarioCheck[] = [];
  try {
    const cartId = await createCart([{ merchandiseId: VARIANTS[0], quantity: 7 }]);
    ctx.fakeVr.state.nextOutcome = outcome;
    const body = { cartId, selectedAddressId: ctx.addressId, deliveryMethod: "jilo_own", keyId: ctx.keyId, cardEncrypted: ctx.cardEncrypted, cpf: ctx.cpf };
    const res = await handleVrCheckout(buildRequest(ctx.jwt, body), ctx.deps);
    const json = await res.json();
    checks.push(check("status 402", res.status === 402, `status=${res.status} body=${JSON.stringify(json)}`));
    checks.push(check(`classe=${expectedClasse}`, json.classe === expectedClasse, `classe=${json.classe}`));

    const { data: txRow } = await ctx.serviceClient.from("vr_transactions").select("*").eq("cart_id", cartId).maybeSingle();
    checks.push(check("vr_transactions.status=declined", txRow?.status === "declined", String(txRow?.status)));

    let draftDeleted = true;
    if (txRow?.shopify_draft_order_id) {
      const draft = await fetchDraft(txRow.shopify_draft_order_id);
      draftDeleted = draft === null;
    }
    checks.push(check("draft apagado", draftDeleted));

    const { count } = await ctx.serviceClient
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("shopify_order_id", txRow?.shopify_order_id ?? "___none___");
    checks.push(check("nenhum pedido criado", (count ?? 0) === 0));

    return { name, expected: "402", obtained: String(res.status), checks, ok: checks.every((c) => c.pass), vrTransactionId: txRow?.id };
  } catch (err) {
    checks.push(check("execucao sem excecao", false, shortErr(err)));
    return { name, expected: "402", obtained: "erro", checks, ok: false };
  }
}

async function scenarioDuploClique(ctx: Ctx): Promise<ScenarioResult> {
  const name = "duplo_clique";
  const checks: ScenarioCheck[] = [];
  const paymentsBefore = ctx.fakeVr.state.payments.length;
  try {
    const cartId = await createCart([{ merchandiseId: VARIANTS[0], quantity: 7 }]);
    const body = { cartId, selectedAddressId: ctx.addressId, deliveryMethod: "jilo_own", keyId: ctx.keyId, cardEncrypted: ctx.cardEncrypted, cpf: ctx.cpf };
    const [r1, r2] = await Promise.all([
      handleVrCheckout(buildRequest(ctx.jwt, body), ctx.deps),
      handleVrCheckout(buildRequest(ctx.jwt, body), ctx.deps),
    ]);
    const j1 = await r1.json();
    const j2 = await r2.json();
    const oneOk =
      (r1.status === 200 && (r2.status === 409 || (r2.status === 200 && j2.idempotent))) ||
      (r2.status === 200 && (r1.status === 409 || (r1.status === 200 && j1.idempotent)));
    checks.push(check("um 200 e o outro 409/idempotente", oneOk, `r1=${r1.status} r2=${r2.status}`));
    checks.push(check("fake recebeu exatamente 1 pagamento", ctx.fakeVr.state.payments.length - paymentsBefore === 1));

    const { count } = await ctx.serviceClient
      .from("vr_transactions")
      .select("id", { count: "exact", head: true })
      .eq("cart_id", cartId)
      .eq("status", "approved");
    checks.push(check("exatamente 1 vr_transactions approved", (count ?? 0) === 1, `count=${count}`));

    return { name, expected: "200+409", obtained: `${r1.status}/${r2.status}`, checks, ok: checks.every((c) => c.pass) };
  } catch (err) {
    checks.push(check("execucao sem excecao", false, shortErr(err)));
    return { name, expected: "200+409", obtained: "erro", checks, ok: false };
  }
}

async function scenarioFalhaCompleteEstorno(ctx: Ctx): Promise<ScenarioResult> {
  const name = "falha_complete_estorno";
  const checks: ScenarioCheck[] = [];
  const paymentsBefore = ctx.fakeVr.state.payments.length;
  const refundsBefore = ctx.fakeVr.state.refunds.length;
  try {
    const cartId = await createCart([{ merchandiseId: VARIANTS[0], quantity: 7 }]);
    ctx.injector.failNextComplete = true;
    const body = { cartId, selectedAddressId: ctx.addressId, deliveryMethod: "jilo_own", keyId: ctx.keyId, cardEncrypted: ctx.cardEncrypted, cpf: ctx.cpf };
    const res = await handleVrCheckout(buildRequest(ctx.jwt, body), ctx.deps);
    const json = await res.json();
    checks.push(check("status 502 order_failed_refunded", res.status === 502 && json.code === "order_failed_refunded", `status=${res.status} body=${JSON.stringify(json)}`));
    checks.push(check("fake registrou 1 pagamento", ctx.fakeVr.state.payments.length - paymentsBefore === 1));
    checks.push(check("fake registrou 1 estorno do valor cheio", ctx.fakeVr.state.refunds.length - refundsBefore === 1));

    const { data: txRow } = await ctx.serviceClient.from("vr_transactions").select("*").eq("cart_id", cartId).maybeSingle();
    checks.push(check("vr_transactions.status=refunded_auto", txRow?.status === "refunded_auto", String(txRow?.status)));

    const { count } = await ctx.serviceClient
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("shopify_order_id", txRow?.shopify_order_id ?? "___none___");
    checks.push(check("nenhum pedido criado", (count ?? 0) === 0));

    return { name, expected: "502", obtained: String(res.status), checks, ok: checks.every((c) => c.pass), vrTransactionId: txRow?.id };
  } catch (err) {
    checks.push(check("execucao sem excecao", false, shortErr(err)));
    return { name, expected: "502", obtained: "erro", checks, ok: false };
  } finally {
    ctx.injector.failNextComplete = false;
  }
}

async function scenarioTimeoutReconciliado(ctx: Ctx): Promise<ScenarioResult> {
  const name = "timeout_reconciliado";
  const checks: ScenarioCheck[] = [];
  const paymentsBefore = ctx.fakeVr.state.payments.length;
  const refundsBefore = ctx.fakeVr.state.refunds.length;
  try {
    const cartId = await createCart([{ merchandiseId: VARIANTS[0], quantity: 7 }]);
    ctx.fakeVr.state.nextOutcome = "timeout";
    const body = { cartId, selectedAddressId: ctx.addressId, deliveryMethod: "jilo_own", keyId: ctx.keyId, cardEncrypted: ctx.cardEncrypted, cpf: ctx.cpf };
    // Este cenário demora ~30s de verdade: vrFetch aborta em VR_TIMEOUT_MS e o
    // handler reconcilia via getTransaction (a VR falsa já tinha CONFIRMADA gravado).
    console.log("[e2e] timeout_reconciliado: aguardando ~30s (VR_TIMEOUT_MS)...");
    const res = await handleVrCheckout(buildRequest(ctx.jwt, body), ctx.deps);
    const json = await res.json();
    checks.push(check("status 200 apos reconciliacao", res.status === 200, `status=${res.status} body=${JSON.stringify(json)}`));
    checks.push(check("fake: 1 pagamento", ctx.fakeVr.state.payments.length - paymentsBefore === 1));
    checks.push(check("fake: 0 estornos", ctx.fakeVr.state.refunds.length - refundsBefore === 0));
    return { name, expected: "200", obtained: String(res.status), checks, ok: checks.every((c) => c.pass), orderName: json.orderName };
  } catch (err) {
    checks.push(check("execucao sem excecao", false, shortErr(err)));
    return { name, expected: "200", obtained: "erro", checks, ok: false };
  }
}

async function scenarioEnderecoForaArea(ctx: Ctx): Promise<ScenarioResult> {
  const name = "endereco_fora_area";
  const checks: ScenarioCheck[] = [];
  let tempAddressId: string | null = null;
  try {
    const { data: inserted, error } = await ctx.serviceClient
      .from("addresses")
      .insert({
        user_id: ctx.qaUserId,
        label: "E2E VR – temporário",
        recipient_name: "QA VR TESTE",
        street: "Rua Teste E2E",
        number: "100",
        complement: null,
        neighborhood: "Centro",
        city: "Campinas",
        state: "SP",
        cep: "13010000",
        is_default: false,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`insert address falhou: ${error?.message}`);
    tempAddressId = inserted.id;

    const cartId = `gid://shopify/Cart/e2e-fora-area-${Date.now()}`;
    const body = { cartId, selectedAddressId: tempAddressId, deliveryMethod: "jilo_own", keyId: ctx.keyId, cardEncrypted: ctx.cardEncrypted, cpf: ctx.cpf };
    const res = await handleVrCheckout(buildRequest(ctx.jwt, body), ctx.deps);
    const json = await res.json();
    checks.push(
      check("status 422 address_not_deliverable", res.status === 422 && json.code === "address_not_deliverable", `status=${res.status} body=${JSON.stringify(json)}`),
    );
    return { name, expected: "422", obtained: String(res.status), checks, ok: checks.every((c) => c.pass) };
  } catch (err) {
    checks.push(check("execucao sem excecao", false, shortErr(err)));
    return { name, expected: "422", obtained: "erro", checks, ok: false };
  } finally {
    if (tempAddressId) {
      const { error } = await ctx.serviceClient.from("addresses").delete().eq("id", tempAddressId);
      console.log(`[e2e][cleanup] endereco temporario ${tempAddressId}: ${error ? `falhou (${error.message})` : "apagado"}`);
    }
  }
}

async function scenarioEnderecoAlheio(ctx: Ctx): Promise<ScenarioResult> {
  const name = "endereco_alheio";
  const checks: ScenarioCheck[] = [];
  try {
    const cartId = `gid://shopify/Cart/e2e-alheio-${Date.now()}`;
    const body = {
      cartId,
      selectedAddressId: crypto.randomUUID(),
      deliveryMethod: "jilo_own",
      keyId: ctx.keyId,
      cardEncrypted: ctx.cardEncrypted,
      cpf: ctx.cpf,
    };
    const res = await handleVrCheckout(buildRequest(ctx.jwt, body), ctx.deps);
    const json = await res.json();
    checks.push(check("status 403 address_forbidden", res.status === 403 && json.code === "address_forbidden", `status=${res.status} body=${JSON.stringify(json)}`));
    return { name, expected: "403", obtained: String(res.status), checks, ok: checks.every((c) => c.pass) };
  } catch (err) {
    checks.push(check("execucao sem excecao", false, shortErr(err)));
    return { name, expected: "403", obtained: "erro", checks, ok: false };
  }
}

// ---------------------------------------------------------------------------
// Limpeza — vr_transactions do QA criadas neste run é a fonte da verdade
// (pega até pedidos de cenários que crasharam no meio).
// ---------------------------------------------------------------------------

async function cleanup(serviceClient: SupabaseClient, qaUserId: string, runStartIso: string, keep: boolean): Promise<string[]> {
  const notes: string[] = [];
  if (keep) {
    notes.push("limpeza pulada (--keep)");
    return notes;
  }

  const { data: rows, error } = await serviceClient
    .from("vr_transactions")
    .select("*")
    .eq("user_id", qaUserId)
    .gte("created_at", runStartIso);
  if (error) {
    notes.push(`falha ao listar vr_transactions para limpeza: ${error.message}`);
    return notes;
  }

  for (const row of rows ?? []) {
    if (row.shopify_order_id) {
      const cancel = await cancelOrder(row.shopify_order_id);
      notes.push(`orderCancel ${row.shopify_order_name ?? row.shopify_order_id}: ${cancel.ok ? "ok" : "FALHOU"} (${cancel.detail})`);

      const ordersRow = await pollOrdersRow(serviceClient, row.shopify_order_id, { timeoutMs: 15_000 });
      if (ordersRow) {
        const { error: updErr } = await serviceClient
          .from("orders")
          .update({ status: "cancelled", notes: "E2E VR (VR falsa) — pedido de teste cancelado" })
          .eq("id", ordersRow.id);
        notes.push(`orders.update ${row.shopify_order_name}: ${updErr ? `FALHOU (${updErr.message})` : "ok"}`);
      } else {
        notes.push(`orders row de ${row.shopify_order_name ?? row.shopify_order_id} nao apareceu em 15s — webhook atrasado, revisar manualmente`);
      }
    } else if (row.shopify_draft_order_id && row.status !== "approved") {
      await deleteDraftOrder(row.shopify_draft_order_id);
      notes.push(`draftOrderDelete ${row.shopify_draft_order_id}: ok (best-effort)`);
    }
  }

  return notes;
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

function timestampForFilename(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function printTable(results: ScenarioResult[]): void {
  console.table(results.map((r) => ({ cenario: r.name, esperado: r.expected, obtido: r.obtained, ok: r.ok })));
}

async function writeReport(results: ScenarioResult[], cleanupNotes: string[]): Promise<{ mdPath: string; jsonPath: string }> {
  const outDir = ".claude/.work/pagamento-vr";
  await Deno.mkdir(outDir, { recursive: true });
  const ts = timestampForFilename(new Date());
  const mdPath = `${outDir}/e2e-local-${ts}.md`;
  const jsonPath = `${outDir}/e2e-local-${ts}.json`;

  const lines: string[] = ["# E2E local do pagamento VR (VR falsa)", "", `- Rodado em: ${new Date().toISOString()}`, ""];
  for (const r of results) {
    lines.push(`## ${r.name}`, "", `- esperado: ${r.expected} | obtido: ${r.obtained} | ${r.ok ? "OK" : "FALHOU"}`);
    if (r.orderName) lines.push(`- orderName: ${r.orderName}`);
    if (r.vrTransactionId) lines.push(`- vr_transactions.id: ${r.vrTransactionId}`);
    if (r.cents) lines.push(`- centavos: ${JSON.stringify(r.cents)}`);
    if (r.padding) lines.push(`- padding: ${r.padding}`);
    lines.push("", "| check | resultado | detalhe |", "|---|---|---|");
    for (const c of r.checks) lines.push(`| ${c.label} | ${c.pass ? "✔" : "✘"} | ${(c.detail ?? "").slice(0, 200)} |`);
    lines.push("");
  }
  lines.push("## Limpeza", "");
  for (const n of cleanupNotes) lines.push(`- ${n}`);

  await Deno.writeTextFile(mdPath, lines.join("\n"));
  await Deno.writeTextFile(jsonPath, JSON.stringify({ results, cleanupNotes }, null, 2));
  return { mdPath, jsonPath };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = Deno.args;
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
  const keep = args.includes("--keep");

  // --- Guardas — NENHUMA chamada externa antes daqui ---
  const vrEnv = Deno.env.get("VR_ENV");
  if (vrEnv !== "mock") {
    console.error(`[e2e] guarda: VR_ENV precisa ser "mock" (recusa hml/prod para não arriscar cobrança real). Atual: "${vrEnv ?? ""}".`);
    Deno.exit(1);
  }
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    console.error("[e2e] guarda: SUPABASE_SERVICE_ROLE_KEY ausente/vazia em .env.vr-e2e. Preencha antes de rodar ao vivo.");
    Deno.exit(1);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("[e2e] guarda: SUPABASE_URL/SUPABASE_ANON_KEY ausentes em .env.vr-e2e.");
    Deno.exit(1);
  }

  // --- Interceptor de fetch instalado ANTES de qualquer client real ---
  const fakeVr = createFakeVr();
  const injector: Injector = { failNextComplete: false };
  installFetchInterceptor(fakeVr, injector);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // ponytail: margem de 10 min porque o relógio local pode estar adiantado em relação ao do banco
  // (medido 2026-09-25: ~20 s) e o filtro compara com vr_transactions.created_at do banco. Seguro:
  // o filtro também exige user_id do QA, usado só por este harness; limpar de novo o que já foi limpo
  // é idempotente (cancel de pedido cancelado e delete de draft apagado só dão erro inofensivo).
  const runStartIso = new Date(Date.now() - 10 * 60_000).toISOString();
  const results: ScenarioResult[] = [];
  let cleanupNotes: string[] = [];
  let exitCode = 0;

  try {
    console.log("[e2e] preflight: token Admin, disponibilidade dos variants, rate limit do QA...");
    await getShopifyAdminToken();

    const unavailable = await checkVariantsAvailable(VARIANTS);
    if (unavailable.length > 0) throw new Error(`variants indisponiveis (availableForSale=false ou inexistentes): ${unavailable.join(", ")}`);

    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count: recentBad } = await serviceClient
      .from("vr_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", QA_USER_ID)
      .in("status", ["declined", "error"])
      .gte("created_at", since);
    if ((recentBad ?? 0) >= RATE_LIMIT_SAFETY_MARGIN) {
      throw new Error(
        `QA ja tem ${recentBad} recusas/erros nos ultimos 15min — rodar os cenarios de recusa agora estouraria o rate limit (limite real: 5). Aguarde a janela passar.`,
      );
    }

    console.log("[e2e] autenticando QA via magic link...");
    const jwt = await getQaJwt(serviceClient, anonClient, QA_EMAIL);

    console.log("[e2e] obtendo chave publica da VR falsa e cifrando cartao de teste...");
    const { keyId, cardEncrypted } = await buildCardEncrypted();

    // buildDefaultDeps() reaproveitado entre cenários — só fecha sobre caches de módulo
    // (token VR, token Admin, chave pública), sem estado por-requisição que precise renovar.
    const ctx: Ctx = {
      serviceClient,
      jwt,
      keyId,
      cardEncrypted,
      cpf: TEST_CARD.documento,
      deps: buildDefaultDeps(),
      fakeVr,
      injector,
      addressId: QA_ADDRESS_ID_SJC,
      qaUserId: QA_USER_ID,
      supabaseUrl,
      anonKey,
    };

    const scenarios: { name: string; run: () => Promise<ScenarioResult> }[] = [
      {
        name: "aprovado_7_jilo_own",
        run: async () => (await runApprovedFlowScenario(ctx, "aprovado_7_jilo_own", [{ merchandiseId: VARIANTS[0], quantity: 7 }], { deliveryMethod: "jilo_own" })).result,
      },
      {
        name: "aprovado_14_kit_pix5",
        run: async () =>
          (
            await runApprovedFlowScenario(
              ctx,
              "aprovado_14_kit_pix5",
              [
                { merchandiseId: VARIANTS[0], quantity: 7 },
                { merchandiseId: VARIANTS[1], quantity: 7 },
              ],
              { deliveryMethod: "jilo_own" },
            )
          ).result,
      },
      { name: "aprovado_menos7_uber_direct", run: () => scenarioMenos7UberDirect(ctx) },
      { name: "recusa_saldo", run: () => runDeclineScenario(ctx, "recusa_saldo", "decline:16", "saldo") },
      { name: "recusa_cartao_expirado", run: () => runDeclineScenario(ctx, "recusa_cartao_expirado", "decline:03", "cartao") },
      { name: "duplo_clique", run: () => scenarioDuploClique(ctx) },
      { name: "falha_complete_estorno", run: () => scenarioFalhaCompleteEstorno(ctx) },
      { name: "timeout_reconciliado", run: () => scenarioTimeoutReconciliado(ctx) },
      { name: "endereco_fora_area", run: () => scenarioEnderecoForaArea(ctx) },
      { name: "endereco_alheio", run: () => scenarioEnderecoAlheio(ctx) },
    ];

    for (const scenario of scenarios) {
      if (only && scenario.name !== only) continue;
      console.log(`[e2e] rodando cenario: ${scenario.name}`);
      const result = await scenario.run();
      results.push(result);
      console.log(`[e2e] ${scenario.name}: ${result.ok ? "OK" : "FALHOU"} (esperado=${result.expected} obtido=${result.obtained})`);
    }

    if (only && results.length === 0) {
      throw new Error(`--only "${only}" nao corresponde a nenhum cenario conhecido`);
    }
  } catch (err) {
    console.error(`[e2e] erro fatal: ${shortErr(err)}`);
    exitCode = 1;
  } finally {
    console.log("[e2e] limpeza...");
    try {
      cleanupNotes = await cleanup(serviceClient, QA_USER_ID, runStartIso, keep);
    } catch (err) {
      cleanupNotes.push(`limpeza falhou: ${shortErr(err)}`);
    }
    for (const n of cleanupNotes) console.log(`[e2e][cleanup] ${n}`);

    if (results.length > 0) printTable(results);
    try {
      const { mdPath, jsonPath } = await writeReport(results, cleanupNotes);
      console.log(`[e2e] relatorio: ${mdPath} / ${jsonPath}`);
    } catch (err) {
      console.error(`[e2e] falha ao escrever relatorio: ${shortErr(err)}`);
    }
  }

  if (results.some((r) => !r.ok)) exitCode = 1;
  Deno.exit(exitCode);
}

if (import.meta.main) {
  await main();
}
