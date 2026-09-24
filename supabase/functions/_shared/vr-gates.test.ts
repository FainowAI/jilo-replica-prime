import { assert, assertEquals } from "jsr:@std/assert";
import { hasOtherCoupon, hasPixCoupon, validateCartForVr, type VrGateInput } from "./vr-gates.ts";
import type { StorefrontCart, StorefrontCartLine } from "./storefront-cart.ts";
import { LALAMOVE_FIXED_FEE_CENTS } from "./shipping-constants.ts";

const SHIPPING_VARIANT_ID = "gid://shopify/ProductVariant/shipping";
const PRODUCT_VARIANT_ID = "gid://shopify/ProductVariant/1";
const DELIVERABLE_ADDRESS = { state: "SP", city: "São José dos Campos" };

function makeLine(overrides: Partial<StorefrontCartLine> = {}): StorefrontCartLine {
  return {
    id: "gid://shopify/CartLine/1",
    quantity: 1,
    merchandiseId: PRODUCT_VARIANT_ID,
    title: "Item",
    unitAmountCents: 1000,
    lineTotalCents: 1000,
    lineDiscountCents: 0,
    ...overrides,
  };
}

function makeCart(overrides: Partial<StorefrontCart> = {}): StorefrontCart {
  return {
    id: "gid://shopify/Cart/1",
    currencyCode: "BRL",
    totalAmountCents: 10000,
    subtotalAmountCents: 10000,
    orderDiscountCents: 0,
    discountCodes: [],
    lines: [],
    ...overrides,
  };
}

/** <7 itens, com linha fantasma válida para Uber Direct, endereço atendido. */
function baseInput(overrides: Partial<VrGateInput> = {}): VrGateInput {
  return {
    cart: makeCart({
      lines: [
        makeLine({ id: "L1", quantity: 3, merchandiseId: PRODUCT_VARIANT_ID }),
        makeLine({
          id: "L2",
          quantity: 1,
          merchandiseId: SHIPPING_VARIANT_ID,
          unitAmountCents: 500,
          lineTotalCents: 500,
        }),
      ],
    }),
    shippingVariantId: SHIPPING_VARIANT_ID,
    deliveryMethod: "uber_direct",
    address: DELIVERABLE_ADDRESS,
    ...overrides,
  };
}

Deno.test("validateCartForVr: happy path <7 itens com Uber Direct", () => {
  const result = validateCartForVr(baseInput());
  assert(result.ok);
  if (result.ok) {
    assertEquals(result.nonShippingItems, 3);
    assertEquals(result.valorCents, 10000);
  }
});

Deno.test("validateCartForVr: happy path <7 itens com Lalamove", () => {
  const input = baseInput({
    deliveryMethod: "lalamove",
    cart: makeCart({
      lines: [
        makeLine({ id: "L1", quantity: 3, merchandiseId: PRODUCT_VARIANT_ID }),
        makeLine({
          id: "L2",
          quantity: 1,
          merchandiseId: SHIPPING_VARIANT_ID,
          unitAmountCents: LALAMOVE_FIXED_FEE_CENTS,
          lineTotalCents: LALAMOVE_FIXED_FEE_CENTS,
        }),
      ],
    }),
  });
  const result = validateCartForVr(input);
  assert(result.ok);
  if (result.ok) assertEquals(result.nonShippingItems, 3);
});

Deno.test("validateCartForVr: happy path 14 itens jilo_own (sem linha fantasma)", () => {
  const input = baseInput({
    deliveryMethod: "jilo_own",
    cart: makeCart({
      lines: [makeLine({ id: "L1", quantity: 14, merchandiseId: PRODUCT_VARIANT_ID })],
    }),
  });
  const result = validateCartForVr(input);
  assert(result.ok);
  if (result.ok) assertEquals(result.nonShippingItems, 14);
});

Deno.test("validateCartForVr: lalamove aceita linha fantasma mesmo com desconto de linha (assume unitAmountCents bruto)", () => {
  // ponytail: documenta a suposição — se PIX5 acabar sendo alocado
  // proporcionalmente na linha fantasma e amountPerQuantity vier líquido,
  // este teste passa a falhar e sinaliza que o gate precisa somar
  // lineDiscountCents de volta (ver comentário em vr-gates.ts).
  const input = baseInput({
    deliveryMethod: "lalamove",
    cart: makeCart({
      lines: [
        makeLine({ id: "L1", quantity: 3, merchandiseId: PRODUCT_VARIANT_ID }),
        makeLine({
          id: "L2",
          quantity: 1,
          merchandiseId: SHIPPING_VARIANT_ID,
          unitAmountCents: LALAMOVE_FIXED_FEE_CENTS,
          lineTotalCents: LALAMOVE_FIXED_FEE_CENTS,
          lineDiscountCents: 100,
        }),
      ],
    }),
  });
  const result = validateCartForVr(input);
  assert(result.ok);
});

Deno.test("validateCartForVr: currency_not_brl", () => {
  const input = baseInput();
  input.cart = { ...input.cart, currencyCode: "USD" };
  const result = validateCartForVr(input);
  assert(!result.ok);
  if (!result.ok) assertEquals(result.code, "currency_not_brl");
});

Deno.test("validateCartForVr: empty_cart (sem itens não-frete)", () => {
  const input = baseInput({ cart: makeCart({ lines: [] }) });
  const result = validateCartForVr(input);
  assert(!result.ok);
  if (!result.ok) assertEquals(result.code, "empty_cart");
});

Deno.test("validateCartForVr: invalid_kit_quantity (8 itens, não múltiplo de 7)", () => {
  const input = baseInput({
    deliveryMethod: "jilo_own",
    cart: makeCart({
      lines: [makeLine({ id: "L1", quantity: 8, merchandiseId: PRODUCT_VARIANT_ID })],
    }),
  });
  const result = validateCartForVr(input);
  assert(!result.ok);
  if (!result.ok) assertEquals(result.code, "invalid_kit_quantity");
});

Deno.test("validateCartForVr: shipping_line_missing (<7 sem linha fantasma)", () => {
  const input = baseInput({
    cart: makeCart({
      lines: [makeLine({ id: "L1", quantity: 3, merchandiseId: PRODUCT_VARIANT_ID })],
    }),
  });
  const result = validateCartForVr(input);
  assert(!result.ok);
  if (!result.ok) assertEquals(result.code, "shipping_line_missing");
});

Deno.test("validateCartForVr: shipping_line_unexpected (>=7 com linha fantasma sobrando)", () => {
  const input = baseInput({
    deliveryMethod: "jilo_own",
    cart: makeCart({
      lines: [
        makeLine({ id: "L1", quantity: 14, merchandiseId: PRODUCT_VARIANT_ID }),
        makeLine({ id: "L2", quantity: 1, merchandiseId: SHIPPING_VARIANT_ID, unitAmountCents: 500 }),
      ],
    }),
  });
  const result = validateCartForVr(input);
  assert(!result.ok);
  if (!result.ok) assertEquals(result.code, "shipping_line_unexpected");
});

Deno.test("validateCartForVr: shipping_line_invalid (linha fantasma com preço zero)", () => {
  const input = baseInput({
    cart: makeCart({
      lines: [
        makeLine({ id: "L1", quantity: 3, merchandiseId: PRODUCT_VARIANT_ID }),
        makeLine({
          id: "L2",
          quantity: 1,
          merchandiseId: SHIPPING_VARIANT_ID,
          unitAmountCents: 0,
          lineTotalCents: 0,
        }),
      ],
    }),
  });
  const result = validateCartForVr(input);
  assert(!result.ok);
  if (!result.ok) assertEquals(result.code, "shipping_line_invalid");
});

Deno.test("validateCartForVr: address_not_deliverable", () => {
  const input = baseInput({ address: { state: "RJ", city: "Rio de Janeiro" } });
  const result = validateCartForVr(input);
  assert(!result.ok);
  if (!result.ok) assertEquals(result.code, "address_not_deliverable");
});

Deno.test("validateCartForVr: shipping_variant_unconfigured (shippingVariantId null)", () => {
  const input = baseInput({ shippingVariantId: null });
  const result = validateCartForVr(input);
  assert(!result.ok);
  if (!result.ok) assertEquals(result.code, "shipping_variant_unconfigured");
});

Deno.test("hasPixCoupon: true quando discountCodes tem PIX5 applicable", () => {
  const cart = makeCart({ discountCodes: [{ code: "PIX5", applicable: true }] });
  assert(hasPixCoupon(cart));
  assert(!hasOtherCoupon(cart));
});

Deno.test("hasOtherCoupon: true quando discountCodes tem cupom não-PIX applicable", () => {
  const cart = makeCart({ discountCodes: [{ code: "BEMVINDO10", applicable: true }] });
  assert(!hasPixCoupon(cart));
  assert(hasOtherCoupon(cart));
});

Deno.test("hasPixCoupon/hasOtherCoupon: ignora códigos não-applicable", () => {
  const cart = makeCart({
    discountCodes: [
      { code: "PIX5", applicable: false },
      { code: "BEMVINDO10", applicable: false },
    ],
  });
  assert(!hasPixCoupon(cart));
  assert(!hasOtherCoupon(cart));
});
