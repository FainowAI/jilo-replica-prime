/** Testes do `cielo-checkout` — 100% em memória, deps stubados, sem rede. */
import { assert, assertEquals } from "jsr:@std/assert";
import { CieloApiError, type CieloSale } from "../_shared/cielo-client.ts";
import { handleCieloCheckout, type CieloCheckoutDb, type CieloCheckoutDeps, type CieloTransactionRow } from "./handler.ts";

const CART = {
  id: "gid://shopify/Cart/abc123",
  currencyCode: "BRL",
  totalAmountCents: 20000,
  subtotalAmountCents: 21000,
  orderDiscountCents: 1000,
  discountCodes: [{ code: "PIX5", applicable: true }],
  lines: [{ id: "l1", quantity: 7, merchandiseId: "gid://shopify/ProductVariant/1", title: "M", unitAmountCents: 3000, lineTotalCents: 21000, lineDiscountCents: 0 }],
};
const BODY = {
  cartId: CART.id,
  addressId: "11111111-1111-1111-1111-111111111111",
  deliveryMethod: "jilo_own",
  cpf: "52998224725",
  holderName: "Fulano de Tal",
  paymentToken: "0123456789abcdef-0123",
};
const OK_SALE: CieloSale = { paymentId: "pay-1", merchantOrderId: "MO1", status: 2, returnCode: "00", amountCents: 20000 };

function req(over: Record<string, unknown> = {}, auth: string | null = "Bearer t"): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  return new Request("http://localhost/cielo-checkout", { method: "POST", headers, body: JSON.stringify({ ...BODY, ...over }) });
}

function fakeDb(): { db: CieloCheckoutDb; rows: CieloTransactionRow[] } {
  const rows: CieloTransactionRow[] = [];
  const live = (r: CieloTransactionRow) => ["authorizing", "approved", "void_failed"].includes(r.status);
  const db: CieloCheckoutDb = {
    async insertAuthorizing({ userId, cartId, merchantOrderId, valorCents, cieloEnv }) {
      if (rows.some((r) => r.cart_id === cartId && live(r))) return { ok: false, code: "23505" };
      const row: CieloTransactionRow = {
        id: `tx-${rows.length + 1}`, user_id: userId, cart_id: cartId, merchant_order_id: merchantOrderId, cielo_env: cieloEnv,
        cielo_payment_id: null, cielo_status: null, cielo_return_code: null, cielo_authorization_code: null, cielo_tid: null,
        cielo_proof_of_sale: null, valor_cents: valorCents, status: "authorizing", shopify_draft_order_id: null,
        shopify_order_id: null, shopify_order_name: null, error: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      rows.push(row);
      return { ok: true, row };
    },
    async getLiveByCartId(cartId) {
      return rows.find((r) => r.cart_id === cartId && live(r)) ?? null;
    },
    async update(id, patch) {
      Object.assign(rows.find((r) => r.id === id) ?? {}, patch);
    },
    async countRecentUserDeclines() {
      return 0;
    },
    async countRecentEnvDeclines() {
      return 0;
    },
    async getOwnAddress(id) {
      return { id, state: "SP", city: "São José dos Campos", recipientName: "Fulano", street: "Rua X", number: "10", complement: null, neighborhood: "Centro", cep: "12345678" };
    },
    async getShopifyCustomerId() {
      return "gid://shopify/Customer/1";
    },
  };
  return { db, rows };
}

interface Spy {
  deps: CieloCheckoutDeps;
  rows: CieloTransactionRow[];
  calls: string[];
  alerts: string[];
}

function build(over: Partial<CieloCheckoutDeps> = {}, cielo: Partial<CieloCheckoutDeps["cielo"]> = {}, draft: Partial<CieloCheckoutDeps["draft"]> = {}): Spy {
  const { db, rows } = fakeDb();
  const calls: string[] = [];
  const alerts: string[] = [];
  const deps: CieloCheckoutDeps = {
    getUser: async () => ({ id: "u1", email: "qa@x.com" }),
    db,
    getCart: async () => CART,
    applyDiscountCodes: async () => CART,
    validateCartForVr: () => ({ ok: true, valorCents: 20000, nonShippingItems: 7 }),
    hasPixCoupon: () => true,
    hasOtherCoupon: () => false,
    isAreaDeliverable: () => true,
    cielo: {
      createVoucherSale: async () => { calls.push("sale"); return OK_SALE; },
      getSale: async () => OK_SALE,
      findSalesByMerchantOrderId: async () => [],
      voidSale: async () => { calls.push("void"); return { ...OK_SALE, status: 10 }; },
      classifyReturnCode: () => ({ kind: "declined_balance", userMessage: "Saldo insuficiente no cartão Alelo." }),
      newMerchantOrderId: (() => { let n = 0; return () => `MO${++n}`; })(),
      ...cielo,
    },
    draft: {
      create: async () => ({ id: "gid://shopify/DraftOrder/1", totalPriceCents: 20000 }),
      complete: async () => { calls.push("complete"); return { orderId: "gid://shopify/Order/1", orderName: "#1001" }; },
      delete: async () => { calls.push("draft_delete"); },
      getStatus: async () => ({ status: "OPEN", order: null }),
      ...draft,
    },
    sendAlert: async (a) => { alerts.push(a.event); },
    cieloEnv: () => "sandbox",
    env: { ALELO_ENABLED: "true", ALELO_QA_EMAILS: "qa@x.com", SHOPIFY_SHIPPING_VARIANT_ID: "v" },
    now: () => new Date(),
    ...over,
  };
  return { deps, rows, calls, alerts };
}

Deno.test("kill-switch desligado => 404", async () => {
  const s = build({ env: { ALELO_ENABLED: null, ALELO_QA_EMAILS: null, SHOPIFY_SHIPPING_VARIANT_ID: null } });
  assertEquals((await handleCieloCheckout(req(), s.deps)).status, 404);
});

Deno.test("sem JWT => 401", async () => {
  const s = build({ getUser: async () => null });
  assertEquals((await handleCieloCheckout(req({}, null), s.deps)).status, 401);
});

Deno.test("fora de prod, e-mail fora da allowlist => 403; em prod passa", async () => {
  const s = build({ getUser: async () => ({ id: "u", email: "outro@x.com" }) });
  assertEquals((await handleCieloCheckout(req(), s.deps)).status, 403);
  const p = build({ getUser: async () => ({ id: "u", email: "outro@x.com" }), cieloEnv: () => "prod" });
  assertEquals((await handleCieloCheckout(req(), p.deps)).status, 200);
});

Deno.test("body com campo extra (amount/brand) => 400", async () => {
  const s = build();
  assertEquals((await handleCieloCheckout(req({ amount: 1 }), s.deps)).status, 400);
  assertEquals((await handleCieloCheckout(req({ brand: "Elo" }), s.deps)).status, 400);
});

Deno.test("cpf inválido => 422, sem INSERT", async () => {
  const s = build();
  const r = await handleCieloCheckout(req({ cpf: "52998224726" }), s.deps);
  assertEquals(r.status, 422);
  assertEquals(s.rows.length, 0);
});

Deno.test("endereço alheio => 403", async () => {
  const s = build();
  s.deps.db.getOwnAddress = async () => null;
  assertEquals((await handleCieloCheckout(req(), s.deps)).status, 403);
});

Deno.test("gates recusam => 422 e nada é cobrado", async () => {
  const s = build({ validateCartForVr: () => ({ ok: false, status: 422, code: "invalid_kit_quantity", userMessage: "Quantidade inválida." }) });
  const r = await handleCieloCheckout(req(), s.deps);
  assertEquals(r.status, 422);
  assertEquals((await r.json()).code, "invalid_kit_quantity");
  assertEquals(s.calls.includes("sale"), false);
});

Deno.test("aprovado => 200, row approved, draft tags alelo-test fora de prod", async () => {
  let tags: string[] = [];
  const s = build({}, {}, { create: async (i) => { tags = i.tags ?? []; return { id: "d1", totalPriceCents: 20000 }; } });
  const r = await handleCieloCheckout(req(), s.deps);
  assertEquals(r.status, 200);
  assertEquals((await r.json()).orderName, "#1001");
  assertEquals(s.rows[0].status, "approved");
  assertEquals(s.rows[0].cielo_payment_id, "pay-1");
  assertEquals(tags, ["alelo", "alelo-test"]);
});

Deno.test("23505: cart já approved => 200 idempotente, sem nova cobrança", async () => {
  const s = build();
  await handleCieloCheckout(req(), s.deps);
  s.calls.length = 0;
  const r = await handleCieloCheckout(req(), s.deps);
  assertEquals(r.status, 200);
  assertEquals((await r.json()).idempotent, true);
  assertEquals(s.calls.includes("sale"), false);
});

Deno.test("23505: authorizing recente => 409; void_failed => 409", async () => {
  const s = build();
  await s.deps.db.insertAuthorizing({ userId: "u1", cartId: CART.id, merchantOrderId: "OLD", valorCents: 20000, cieloEnv: "sandbox" });
  assertEquals((await handleCieloCheckout(req(), s.deps)).status, 409);
  s.rows[0].status = "void_failed";
  assertEquals((await handleCieloCheckout(req(), s.deps)).status, 409);
  assertEquals(s.calls.includes("sale"), false);
});

Deno.test("23505: authorizing velho + consulta vazia libera; consulta com venda mantém", async () => {
  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  const s = build();
  await s.deps.db.insertAuthorizing({ userId: "u1", cartId: CART.id, merchantOrderId: "OLD", valorCents: 20000, cieloEnv: "sandbox" });
  s.rows[0].created_at = old;
  const r = await handleCieloCheckout(req(), s.deps);
  assertEquals(r.status, 200);
  assertEquals(s.rows[0].status, "error");

  const k = build({}, { findSalesByMerchantOrderId: async () => ["p"] });
  await k.deps.db.insertAuthorizing({ userId: "u1", cartId: CART.id, merchantOrderId: "OLD", valorCents: 20000, cieloEnv: "sandbox" });
  k.rows[0].created_at = old;
  assertEquals((await handleCieloCheckout(req(), k.deps)).status, 409);
  assertEquals(k.rows[0].status, "authorizing");

  const f = build({}, { findSalesByMerchantOrderId: async () => { throw new Error("x"); } });
  await f.deps.db.insertAuthorizing({ userId: "u1", cartId: CART.id, merchantOrderId: "OLD", valorCents: 20000, cieloEnv: "sandbox" });
  f.rows[0].created_at = old;
  assertEquals((await handleCieloCheckout(req(), f.deps)).status, 409);
  assertEquals(f.rows[0].status, "authorizing");
});

Deno.test("recusa por saldo => 402, draft apagado, row declined, sem returnCode bruto", async () => {
  const s = build({}, { createVoucherSale: async () => ({ ...OK_SALE, status: 3, returnCode: "51", returnMessage: "raw" }) });
  const r = await handleCieloCheckout(req(), s.deps);
  assertEquals(r.status, 402);
  const text = await r.text();
  assert(text.includes("Saldo insuficiente"));
  assertEquals(text.includes("51"), false);
  assertEquals(s.rows[0].status, "declined");
  assert(s.calls.includes("draft_delete"));
});

Deno.test("timeout => 202 payment_pending, linha segue authorizing, draft preservado", async () => {
  const s = build({}, { createVoucherSale: async () => { throw new CieloApiError({ code: "cielo_timeout" }); } });
  const r = await handleCieloCheckout(req(), s.deps);
  assertEquals(r.status, 202);
  assertEquals((await r.json()).code, "payment_pending");
  assertEquals(s.rows[0].status, "authorizing");
  assertEquals(s.calls.includes("draft_delete"), false);
});

Deno.test("5xx também é ambíguo; status não terminal (12) => 202", async () => {
  const a = build({}, { createVoucherSale: async () => { throw new CieloApiError({ code: "cielo_http_502", status: 502 }); } });
  assertEquals((await handleCieloCheckout(req(), a.deps)).status, 202);
  assertEquals(a.rows[0].status, "authorizing");
  const b = build({}, { createVoucherSale: async () => ({ ...OK_SALE, status: 12, returnCode: "" }) });
  assertEquals((await handleCieloCheckout(req(), b.deps)).status, 202);
  assertEquals(b.rows[0].status, "authorizing");
});

Deno.test("timeout mas consulta acha venda aprovada => 200", async () => {
  const s = build({}, {
    createVoucherSale: async () => { throw new CieloApiError({ code: "cielo_timeout" }); },
    findSalesByMerchantOrderId: async () => ["pay-1"],
  });
  assertEquals((await handleCieloCheckout(req(), s.deps)).status, 200);
  assertEquals(s.rows[0].status, "approved");
});

Deno.test("erro 4xx definitivo => 502, row error, draft apagado", async () => {
  const s = build({}, { createVoucherSale: async () => { throw new CieloApiError({ code: "cielo_http_400", status: 400 }); } });
  assertEquals((await handleCieloCheckout(req(), s.deps)).status, 502);
  assertEquals(s.rows[0].status, "error");
  assert(s.calls.includes("draft_delete"));
  assert(/^cielo_http_4/.test(s.rows[0].error ?? "")); // M3: formato que o filtro de rate limit conta
});

Deno.test("B6: falha do draft grava só código fixo, sem texto da Shopify", async () => {
  const s = build({}, {}, { create: async () => { throw new Error("endereço Rua Secreta 10 inválido"); } });
  assertEquals((await handleCieloCheckout(req(), s.deps)).status, 502);
  assertEquals(s.rows[0].error, "shopify_draft_failed:0");
});

Deno.test("B1: void ok mas draft.delete lança => voided_auto, não void_failed", async () => {
  const s = build({}, {}, { complete: async () => { throw new Error("x"); }, delete: async () => { throw new Error("d"); } });
  const r = await handleCieloCheckout(req(), s.deps);
  assertEquals((await r.json()).code, "order_failed_refunded");
  assertEquals(s.rows[0].status, "voided_auto");
  assertEquals(s.alerts, []);
});

Deno.test("M5: 23505 com approved de OUTRO usuário => 409 sem orderName", async () => {
  const s = build();
  await handleCieloCheckout(req(), s.deps);
  s.deps.getUser = async () => ({ id: "u2", email: "qa@x.com" });
  const r = await handleCieloCheckout(req(), s.deps);
  assertEquals(r.status, 409);
  const j = await r.json();
  assertEquals(j.orderName, undefined);
  assertEquals(j.orderId, undefined);
});

Deno.test("complete falha mas draft COMPLETED => 200 sem void", async () => {
  const s = build({}, {}, {
    complete: async () => { throw new Error("net"); },
    getStatus: async () => ({ status: "COMPLETED", order: { id: "gid://shopify/Order/9", name: "#1009" } }),
  });
  const r = await handleCieloCheckout(req(), s.deps);
  assertEquals(r.status, 200);
  assertEquals((await r.json()).orderName, "#1009");
  assertEquals(s.calls.includes("void"), false);
  assertEquals(s.rows[0].status, "approved");
});

Deno.test("complete falha 2x (draft OPEN) => void => 502 voided_auto", async () => {
  let n = 0;
  const s = build({}, {}, { complete: async () => { n++; throw new Error("x"); } });
  const r = await handleCieloCheckout(req(), s.deps);
  assertEquals(r.status, 502);
  assertEquals((await r.json()).code, "order_failed_refunded");
  assertEquals(n, 2);
  assertEquals(s.calls.filter((c) => c === "void").length, 1);
  assertEquals(s.rows[0].status, "voided_auto");
});

Deno.test("complete falha e status do draft indisponível => NÃO anula, 202", async () => {
  const s = build({}, {}, { complete: async () => { throw new Error("x"); }, getStatus: async () => { throw new Error("y"); } });
  assertEquals((await handleCieloCheckout(req(), s.deps)).status, 202);
  assertEquals(s.calls.includes("void"), false);
});

Deno.test("void falha => void_failed + alerta + 502", async () => {
  const s = build({}, { voidSale: async () => { throw new Error("v"); } }, { complete: async () => { throw new Error("x"); } });
  const r = await handleCieloCheckout(req(), s.deps);
  assertEquals(r.status, 502);
  assertEquals((await r.json()).code, "order_failed_refund_failed");
  assertEquals(s.rows[0].status, "void_failed");
  assertEquals(s.alerts, ["void_failed"]);
});

Deno.test("valor devolvido divergente => void, sem complete", async () => {
  const s = build({}, { createVoucherSale: async () => ({ ...OK_SALE, amountCents: 19999 }) });
  const r = await handleCieloCheckout(req(), s.deps);
  assertEquals(r.status, 502);
  assertEquals(s.calls.includes("complete"), false);
  assertEquals(s.calls.includes("void"), true);
  assertEquals(s.rows[0].status, "voided_auto");
});

Deno.test("total do draft divergente => nenhuma chamada Cielo", async () => {
  const s = build({}, {}, { create: async () => ({ id: "d", totalPriceCents: 1 }) });
  assertEquals((await handleCieloCheckout(req(), s.deps)).status, 502);
  assertEquals(s.calls.includes("sale"), false);
});

Deno.test("sem PIX5 no cart => servidor aplica o cupom", async () => {
  let applied = 0;
  const s = build({ hasPixCoupon: () => false, applyDiscountCodes: async () => { applied++; return CART; } });
  assertEquals((await handleCieloCheckout(req(), s.deps)).status, 200);
  assertEquals(applied, 1);
});

Deno.test("rate limit: 5 recusas => 429; breaker => 503", async () => {
  const s = build();
  s.deps.db.countRecentUserDeclines = async () => 5;
  assertEquals((await handleCieloCheckout(req(), s.deps)).status, 429);
  const b = build();
  b.deps.db.countRecentEnvDeclines = async () => 30;
  assertEquals((await handleCieloCheckout(req(), b.deps)).status, 503);
});
