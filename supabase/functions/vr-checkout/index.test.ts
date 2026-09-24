/**
 * Testes do orquestrador `vr-checkout` — 100% em memória, sem rede e sem
 * depender dos módulos da TRACK A: importa só `handleVrCheckout` e os tipos
 * de `./index.ts`; `db`, `getCart`, `validateCartForVr`, `vr.*` e `draft.*`
 * são todos stubs locais (fixture com `Map`/array simulando a constraint
 * única parcial de `vr_transactions`).
 */
import { assert, assertEquals } from "jsr:@std/assert";
import {
  handleVrCheckout,
  type VrCheckoutDb,
  type VrCheckoutDeps,
  type VrTransactionRow,
} from "./handler.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HAPPY_CART = {
  id: "gid://shopify/Cart/abc123",
  currencyCode: "BRL",
  totalAmountCents: 20000,
  subtotalAmountCents: 21000,
  orderDiscountCents: 1000,
  discountCodes: [{ code: "PIX5", applicable: true }],
  lines: [
    {
      id: "line1",
      quantity: 7,
      merchandiseId: "gid://shopify/ProductVariant/1",
      title: "Marmita",
      unitAmountCents: 3000,
      lineTotalCents: 21000,
      lineDiscountCents: 0,
    },
  ],
};

const VALID_BODY = {
  cartId: HAPPY_CART.id,
  selectedAddressId: "11111111-1111-1111-1111-111111111111",
  deliveryMethod: "jilo_own",
  keyId: "key-1",
  cardEncrypted: "YWJjZGVmZw==",
};

function makeReq(bodyOverrides: Record<string, unknown> = {}, authHeader: string | null = "Bearer test-token"): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader) headers.Authorization = authHeader;
  return new Request("http://localhost/vr-checkout", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...VALID_BODY, ...bodyOverrides }),
  });
}

/** Fixture de `vr_transactions` em memória — reproduz a constraint única parcial (cart_id) where status in (authorizing, approved). */
function makeFakeDb(): { db: VrCheckoutDb; rows: VrTransactionRow[] } {
  const rows: VrTransactionRow[] = [];
  let seq = 0;
  const isLive = (r: VrTransactionRow) => r.status === "authorizing" || r.status === "approved";

  const db: VrCheckoutDb = {
    async insertAuthorizing({ userId, cartId, idTransacaoVan, valorCents }) {
      if (rows.some((r) => r.cart_id === cartId && isLive(r))) {
        return { ok: false, code: "23505" };
      }
      seq++;
      const row: VrTransactionRow = {
        id: `tx-${seq}`,
        user_id: userId,
        cart_id: cartId,
        id_transacao_van: idTransacaoVan,
        vr_id_transacao: null,
        vr_codigo_retorno: null,
        vr_codigo_autorizacao: null,
        valor_cents: valorCents,
        status: "authorizing",
        shopify_draft_order_id: null,
        shopify_order_id: null,
        shopify_order_name: null,
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      rows.push(row);
      return { ok: true, row };
    },
    async getLiveByCartId(cartId) {
      return rows.find((r) => r.cart_id === cartId && isLive(r)) ?? null;
    },
    async update(id, patch) {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
    },
    async countRecentUserDeclinesOrErrors() {
      return 0;
    },
    async countRecentGlobalDeclines() {
      return 0;
    },
    async getOwnAddress(addressId, userId) {
      return {
        id: addressId,
        state: "SP",
        city: "São José dos Campos",
        recipientName: "Fulano de Tal",
        street: "Rua X",
        number: "10",
        complement: null,
        neighborhood: "Centro",
        cep: "12345678",
      };
    },
    async getShopifyCustomerId() {
      return "gid://shopify/Customer/1";
    },
  };

  return { db, rows };
}

function buildDeps(overrides: Partial<VrCheckoutDeps> = {}): VrCheckoutDeps {
  const { db } = makeFakeDb();
  const base: VrCheckoutDeps = {
    getUser: async () => ({ id: "user-1", email: "user@example.com" }),
    db,
    getCart: async () => HAPPY_CART,
    applyDiscountCodes: async () => HAPPY_CART,
    validateCartForVr: () => ({ ok: true, valorCents: HAPPY_CART.totalAmountCents, nonShippingItems: 7 }),
    hasPixCoupon: () => true,
    hasOtherCoupon: () => false,
    isAreaDeliverable: () => true,
    vr: {
      createPayment: async () => ({
        id_transacao: "vr-1",
        valor: HAPPY_CART.totalAmountCents,
        codigo_retorno: "00",
        codigo_autorizacao: "AUTH1",
      }),
      getTransaction: async () => ({ id_transacao: "vr-1", valor: HAPPY_CART.totalAmountCents, status: "CONFIRMADA" }),
      refund: async () => ({ noop: false }),
      classifyReturnCode: () => ({ classe: "cartao", userMessage: "Cartão inválido." }),
      newIdTransacaoVan: () => "van-test-1",
    },
    draft: {
      create: async () => ({ id: "gid://shopify/DraftOrder/1", totalPriceCents: HAPPY_CART.totalAmountCents }),
      complete: async () => ({ orderId: "gid://shopify/Order/1", orderName: "#1001" }),
      delete: async () => {},
    },
    env: { VR_ENV: "mock", SHOPIFY_SHIPPING_VARIANT_ID: "gid://shopify/ProductVariant/999" },
    now: () => new Date(),
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// 401 sem sessão
// ---------------------------------------------------------------------------

Deno.test("401 quando getUser retorna null (sem sessão)", async () => {
  const deps = buildDeps({ getUser: async () => null });
  const res = await handleVrCheckout(makeReq({}, null), deps);
  assertEquals(res.status, 401);
  const json = await res.json();
  assertEquals(json.code, "unauthorized");
});

// ---------------------------------------------------------------------------
// 400 body com campo extra
// ---------------------------------------------------------------------------

Deno.test("400 quando o body tem campo extra (cpf)", async () => {
  const deps = buildDeps();
  const res = await handleVrCheckout(makeReq({ cpf: "12345678900" }), deps);
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.code, "invalid_body");
});

// ---------------------------------------------------------------------------
// 403 endereço de outro usuário
// ---------------------------------------------------------------------------

Deno.test("403 quando o endereço não pertence ao usuário", async () => {
  const deps = buildDeps();
  deps.db.getOwnAddress = async () => null;
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 403);
  const json = await res.json();
  assertEquals(json.code, "address_forbidden");
});

// ---------------------------------------------------------------------------
// 422 quantidade inválida / fora de área
// ---------------------------------------------------------------------------

Deno.test("422 quando validateCartForVr recusa quantidade inválida", async () => {
  const deps = buildDeps({
    validateCartForVr: () => ({ ok: false, status: 422, code: "invalid_kit_quantity", userMessage: "Quantidade inválida." }),
  });
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 422);
  const json = await res.json();
  assertEquals(json.code, "invalid_kit_quantity");
});

Deno.test("422 quando o endereço está fora da área atendida", async () => {
  const deps = buildDeps({ isAreaDeliverable: () => false });
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 422);
  const json = await res.json();
  assertEquals(json.code, "address_not_deliverable");
});

// ---------------------------------------------------------------------------
// PIX5
// ---------------------------------------------------------------------------

Deno.test("aplica PIX5 quando o cart nao tem cupom PIX nem outro cupom", async () => {
  let applyCalledWith: [string, string[]] | null = null;
  const deps = buildDeps({
    hasPixCoupon: () => false,
    hasOtherCoupon: () => false,
    applyDiscountCodes: async (cartId, codes) => {
      applyCalledWith = [cartId, codes];
      return HAPPY_CART;
    },
  });
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 200);
  assert(applyCalledWith !== null);
  assertEquals(applyCalledWith![1], ["PIX5"]);
});

Deno.test("nao aplica PIX5 quando o cart ja tem outro cupom aplicavel", async () => {
  let applyCalled = false;
  const deps = buildDeps({
    hasPixCoupon: () => false,
    hasOtherCoupon: () => true,
    applyDiscountCodes: async () => {
      applyCalled = true;
      return HAPPY_CART;
    },
  });
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 200);
  assertEquals(applyCalled, false);
});

// ---------------------------------------------------------------------------
// Idempotência (23505)
// ---------------------------------------------------------------------------

function pushRow(rows: VrTransactionRow[], patch: Partial<VrTransactionRow>): void {
  rows.push({
    id: patch.id ?? "tx-existing",
    user_id: "user-1",
    cart_id: HAPPY_CART.id,
    id_transacao_van: "van-old",
    vr_id_transacao: null,
    vr_codigo_retorno: null,
    vr_codigo_autorizacao: null,
    valor_cents: HAPPY_CART.totalAmountCents,
    status: "authorizing",
    shopify_draft_order_id: null,
    shopify_order_id: null,
    shopify_order_name: null,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...patch,
  });
}

Deno.test("23505 com transacao approved ja existente retorna 200 idempotente", async () => {
  const deps = buildDeps();
  const { rows } = makeFakeDb();
  pushRow(rows, { status: "approved", shopify_order_id: "gid://shopify/Order/old", shopify_order_name: "#999" });
  deps.db = makeFakeDb().db;
  // reusa o mesmo array de rows: reconstroi db "colado" nas rows já populadas
  deps.db.insertAuthorizing = async ({ userId, cartId, idTransacaoVan, valorCents }) => {
    if (rows.some((r) => r.cart_id === cartId && (r.status === "authorizing" || r.status === "approved"))) {
      return { ok: false, code: "23505" };
    }
    const row: VrTransactionRow = {
      id: "tx-new",
      user_id: userId,
      cart_id: cartId,
      id_transacao_van: idTransacaoVan,
      vr_id_transacao: null,
      vr_codigo_retorno: null,
      vr_codigo_autorizacao: null,
      valor_cents: valorCents,
      status: "authorizing",
      shopify_draft_order_id: null,
      shopify_order_id: null,
      shopify_order_name: null,
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    rows.push(row);
    return { ok: true, row };
  };
  deps.db.getLiveByCartId = async (cartId) =>
    rows.find((r) => r.cart_id === cartId && (r.status === "authorizing" || r.status === "approved")) ?? null;

  let draftCreateCalled = false;
  deps.draft.create = async () => {
    draftCreateCalled = true;
    return { id: "x", totalPriceCents: 0 };
  };

  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.orderName, "#999");
  assertEquals(json.idempotent, true);
  assertEquals(draftCreateCalled, false);
});

Deno.test("23505 com authorizing recente retorna 409", async () => {
  const { db, rows } = makeFakeDb();
  pushRow(rows, { status: "authorizing", created_at: new Date().toISOString() });
  const deps = buildDeps({ db });
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 409);
  const json = await res.json();
  assertEquals(json.code, "payment_in_progress");
});

// ---------------------------------------------------------------------------
// Draft total != valor
// ---------------------------------------------------------------------------

Deno.test("draft com total diferente do valor aborta antes de cobrar", async () => {
  const deps = buildDeps();
  let deleteCalled = false;
  let vrCalled = false;
  deps.draft.create = async () => ({ id: "draft-1", totalPriceCents: HAPPY_CART.totalAmountCents + 1 });
  deps.draft.delete = async () => {
    deleteCalled = true;
  };
  deps.vr.createPayment = async () => {
    vrCalled = true;
    return { id_transacao: "x", valor: 0, codigo_retorno: "00" };
  };
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 502);
  const json = await res.json();
  assertEquals(json.code, "order_failed");
  assertEquals(deleteCalled, true);
  assertEquals(vrCalled, false);
});

Deno.test("draft recebe UM desconto de ordem com a soma das alocações (linha + ordem)", async () => {
  // FIXED_AMOUNT por linha é por unidade na Shopify (medido 2026-09-14): 6,93 × 7 viraria 48,51.
  const deps = buildDeps();
  const cart = {
    ...HAPPY_CART,
    orderDiscountCents: 664,
    lines: [{ ...HAPPY_CART.lines[0], lineDiscountCents: 693 }],
  };
  deps.getCart = async () => cart;
  deps.applyDiscountCodes = async () => cart;
  const calls: Parameters<VrCheckoutDeps["draft"]["create"]>[0][] = [];
  deps.draft.create = async (input) => {
    calls.push(input);
    return { id: "draft-1", totalPriceCents: HAPPY_CART.totalAmountCents };
  };
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 200);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].discountCents, 1357);
  assertEquals(calls[0].discountTitle, "Kit + PIX5");
  assertEquals(Object.keys(calls[0].lines[0]).sort(), ["quantity", "variantId"]);
});

// ---------------------------------------------------------------------------
// Declined
// ---------------------------------------------------------------------------

Deno.test("codigo_retorno diferente de 00 recusa o pagamento e apaga o draft", async () => {
  const deps = buildDeps();
  let deleteCalled = false;
  deps.draft.delete = async () => {
    deleteCalled = true;
  };
  deps.vr.createPayment = async () => ({ id_transacao: "vr-1", valor: HAPPY_CART.totalAmountCents, codigo_retorno: "16" });
  deps.vr.classifyReturnCode = () => ({ classe: "saldo", userMessage: "Saldo insuficiente no cartão VR." });
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 402);
  const json = await res.json();
  assertEquals(json.code, "declined");
  assertEquals(json.classe, "saldo");
  assertEquals(deleteCalled, true);
});

// ---------------------------------------------------------------------------
// Falha no complete -> refund + refunded_auto
// ---------------------------------------------------------------------------

Deno.test("falha no complete aciona refund e marca refunded_auto", async () => {
  const { db, rows } = makeFakeDb();
  const deps = buildDeps({ db });
  let refundCalled = false;
  deps.draft.complete = async () => {
    throw new Error("shopify_admin_http_500");
  };
  deps.vr.refund = async () => {
    refundCalled = true;
    return { noop: false };
  };
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 502);
  const json = await res.json();
  assertEquals(json.code, "order_failed_refunded");
  assertEquals(refundCalled, true);
  const row = rows.find((r) => r.cart_id === HAPPY_CART.id)!;
  assertEquals(row.status, "refunded_auto");
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

Deno.test("happy path: aprova e grava breadcrumbs", async () => {
  const { db, rows } = makeFakeDb();
  const deps = buildDeps({ db });
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.orderName, "#1001");
  assertEquals(json.orderId, "gid://shopify/Order/1");
  const row = rows.find((r) => r.cart_id === HAPPY_CART.id)!;
  assertEquals(row.status, "approved");
  assertEquals(row.shopify_draft_order_id, "gid://shopify/DraftOrder/1");
  assertEquals(row.vr_id_transacao, "vr-1");
  assertEquals(row.vr_codigo_retorno, "00");
  assertEquals(row.shopify_order_id, "gid://shopify/Order/1");
  assertEquals(row.shopify_order_name, "#1001");
});

// ---------------------------------------------------------------------------
// Rate limit / breaker (bônus — cobre acceptance criteria "6a recusa em 15 min ⇒ 429")
// ---------------------------------------------------------------------------

Deno.test("429 quando o usuario ja tem 5 recusas/erros recentes", async () => {
  const deps = buildDeps();
  deps.db.countRecentUserDeclinesOrErrors = async () => 5;
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 429);
  const json = await res.json();
  assertEquals(json.code, "too_many_attempts");
});

Deno.test("503 quando o breaker global estourou", async () => {
  const deps = buildDeps();
  deps.db.countRecentGlobalDeclines = async () => 30;
  const res = await handleVrCheckout(makeReq(), deps);
  assertEquals(res.status, 503);
  const json = await res.json();
  assertEquals(json.code, "vr_unavailable");
});
