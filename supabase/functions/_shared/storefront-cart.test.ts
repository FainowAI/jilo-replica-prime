import { assert, assertEquals } from "jsr:@std/assert";
import { applyDiscountCodes, getCart } from "./storefront-cart.ts";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Cart com Kit (desconto de linha) + PIX5 (desconto de ordem) + linha fantasma de frete. */
function fullCartPayload() {
  return {
    data: {
      cart: {
        id: "gid://shopify/Cart/abc",
        discountCodes: [{ code: "PIX5", applicable: true }],
        discountAllocations: [{ discountedAmount: { amount: "5.00", currencyCode: "BRL" } }],
        cost: {
          totalAmount: { amount: "95.00", currencyCode: "BRL" },
          subtotalAmount: { amount: "100.00", currencyCode: "BRL" },
        },
        lines: {
          edges: [
            {
              node: {
                id: "gid://shopify/CartLine/1",
                quantity: 7,
                merchandise: { id: "gid://shopify/ProductVariant/1", title: "Marmita Frango" },
                cost: {
                  totalAmount: { amount: "91.00" },
                  amountPerQuantity: { amount: "13.00" },
                },
                discountAllocations: [{ discountedAmount: { amount: "9.10" } }],
              },
            },
            {
              node: {
                id: "gid://shopify/CartLine/2",
                quantity: 1,
                merchandise: { id: "gid://shopify/ProductVariant/shipping", title: "Frete" },
                cost: {
                  totalAmount: { amount: "4.00" },
                  amountPerQuantity: { amount: "4.00" },
                },
                discountAllocations: [],
              },
            },
          ],
        },
      },
    },
  };
}

Deno.test("getCart: parseia cart com Kit + PIX5 + linha fantasma em centavos corretos", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = ((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(jsonResponse(fullCartPayload()))) as typeof fetch;

    const cart = await getCart("gid://shopify/Cart/abc");

    assert(cart !== null);
    assertEquals(cart!.id, "gid://shopify/Cart/abc");
    assertEquals(cart!.currencyCode, "BRL");
    assertEquals(cart!.totalAmountCents, 9500);
    assertEquals(cart!.subtotalAmountCents, 10000);
    assertEquals(cart!.orderDiscountCents, 500);
    assertEquals(cart!.discountCodes, [{ code: "PIX5", applicable: true }]);
    assertEquals(cart!.lines.length, 2);
    assertEquals(cart!.lines[0], {
      id: "gid://shopify/CartLine/1",
      quantity: 7,
      merchandiseId: "gid://shopify/ProductVariant/1",
      title: "Marmita Frango",
      unitAmountCents: 1300,
      lineTotalCents: 9100,
      lineDiscountCents: 910,
    });
    assertEquals(cart!.lines[1], {
      id: "gid://shopify/CartLine/2",
      quantity: 1,
      merchandiseId: "gid://shopify/ProductVariant/shipping",
      title: "Frete",
      unitAmountCents: 400,
      lineTotalCents: 400,
      lineDiscountCents: 0,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("getCart: retorna null quando o cart não existe", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = ((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({ data: { cart: null } }))) as typeof fetch;

    const cart = await getCart("gid://shopify/Cart/nao-existe");
    assertEquals(cart, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("applyDiscountCodes: envia discountCodes corretos e relê o cart", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  try {
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
      calls.push(body);
      if (calls.length === 1) {
        // resposta da mutation cartDiscountCodesUpdate
        return Promise.resolve(
          jsonResponse({
            data: {
              cartDiscountCodesUpdate: {
                cart: { id: "gid://shopify/Cart/abc" },
                userErrors: [],
              },
            },
          }),
        );
      }
      // releitura via getCart
      return Promise.resolve(jsonResponse(fullCartPayload()));
    }) as typeof fetch;

    const cart = await applyDiscountCodes("gid://shopify/Cart/abc", ["PIX5"]);

    assertEquals(calls.length, 2);
    assertEquals(calls[0].variables.cartId, "gid://shopify/Cart/abc");
    assertEquals(calls[0].variables.discountCodes, ["PIX5"]);
    assert(cart !== null);
    assertEquals(cart!.totalAmountCents, 9500);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
