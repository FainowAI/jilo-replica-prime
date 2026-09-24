/**
 * Gates de negócio do pagamento VR sobre um cart já lido do Storefront API.
 * Puro — sem rede, sem PIX. O caller (vr-checkout) garante o PIX5 aplicado
 * ANTES de chamar validateCartForVr (hasPixCoupon/hasOtherCoupon decidem se
 * precisa aplicar) — este módulo só valida a estrutura do cart resultante.
 */
import { isPixCoupon } from "./pix-coupons.ts";
import { isValidKitQuantity } from "./kit-quantity.ts";
import { isAreaDeliverable } from "./delivery-areas.ts";
import {
  LALAMOVE_FIXED_FEE_CENTS,
  SHIPPING_FREE_THRESHOLD,
  type DeliveryMethod,
} from "./shipping-constants.ts";
import type { StorefrontCart } from "./storefront-cart.ts";

export interface VrGateInput {
  cart: StorefrontCart;
  /** gid da variant fantasma (env); null = desconhecido ⇒ falhar fechado */
  shippingVariantId: string | null;
  deliveryMethod: DeliveryMethod;
  address: { state: string; city: string };
}

export type VrGateResult =
  | { ok: true; valorCents: number; nonShippingItems: number }
  | { ok: false; status: 422; code: string; userMessage: string };

export function hasPixCoupon(cart: StorefrontCart): boolean {
  return cart.discountCodes.some((d) => d.applicable && isPixCoupon(d.code));
}

export function hasOtherCoupon(cart: StorefrontCart): boolean {
  return cart.discountCodes.some((d) => d.applicable && !isPixCoupon(d.code));
}

const GENERIC_ERROR_MESSAGE = "Não foi possível processar o pagamento. Tente novamente.";
const SHIPPING_ERROR_MESSAGE = "Não foi possível calcular o frete. Tente novamente.";

function fail(code: string, userMessage: string): VrGateResult {
  return { ok: false, status: 422, code, userMessage };
}

export function validateCartForVr(input: VrGateInput): VrGateResult {
  const { cart, shippingVariantId, deliveryMethod, address } = input;

  // B5/M6: falha fechado — sem saber qual é a linha fantasma, não dá pra
  // validar a estrutura do frete (ver security.md M6).
  if (shippingVariantId === null) {
    return fail("shipping_variant_unconfigured", GENERIC_ERROR_MESSAGE);
  }

  if (cart.currencyCode !== "BRL") {
    return fail("currency_not_brl", GENERIC_ERROR_MESSAGE);
  }

  const nonShippingLines = cart.lines.filter((l) => l.merchandiseId !== shippingVariantId);
  const shippingLines = cart.lines.filter((l) => l.merchandiseId === shippingVariantId);
  const nonShippingItems = nonShippingLines.reduce((sum, l) => sum + l.quantity, 0);

  if (nonShippingItems <= 0) {
    return fail("empty_cart", "Seu carrinho está vazio.");
  }

  if (!isValidKitQuantity(nonShippingItems)) {
    return fail(
      "invalid_kit_quantity",
      "A quantidade de marmitas precisa ser um múltiplo de 7 a partir de 7.",
    );
  }

  if (nonShippingItems < SHIPPING_FREE_THRESHOLD) {
    if (shippingLines.length !== 1) {
      return fail("shipping_line_missing", SHIPPING_ERROR_MESSAGE);
    }
    const shippingLine = shippingLines[0];
    if (shippingLine.quantity !== 1 || shippingLine.unitAmountCents <= 0) {
      return fail("shipping_line_invalid", SHIPPING_ERROR_MESSAGE);
    }
    // ponytail: compara contra o preço BRUTO da linha (unitAmountCents vem de
    // cost.amountPerQuantity, antes de discountAllocations). Não verificado
    // contra um cart real com PIX5 aplicado na linha fantasma — se a Storefront
    // API devolver amountPerQuantity líquido de desconto, virar
    // `shippingLine.unitAmountCents + shippingLine.lineDiscountCents`.
    if (deliveryMethod === "lalamove" && shippingLine.unitAmountCents !== LALAMOVE_FIXED_FEE_CENTS) {
      return fail("shipping_line_invalid", SHIPPING_ERROR_MESSAGE);
    }
  } else {
    if (shippingLines.length !== 0 || deliveryMethod !== "jilo_own") {
      return fail("shipping_line_unexpected", SHIPPING_ERROR_MESSAGE);
    }
  }

  if (!isAreaDeliverable(address.state, address.city)) {
    return fail("address_not_deliverable", "Ainda não entregamos nessa região.");
  }

  if (cart.totalAmountCents <= 0) {
    return fail("empty_cart", "Seu carrinho está vazio.");
  }

  return { ok: true, valorCents: cart.totalAmountCents, nonShippingItems };
}
