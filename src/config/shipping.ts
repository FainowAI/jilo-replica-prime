/**
 * Configurações de frete da Jilo.
 *
 * Regra de negócio (R34): pedidos com 7+ marmitas têm frete grátis (entrega Jilo).
 * Pedidos com 1-6 marmitas pagam frete cotado via Uber Direct.
 *
 * Mudanças neste valor exigem atualização correspondente em
 * supabase/functions/_shared/shipping-constants.ts.
 */
export const SHIPPING_FREE_THRESHOLD = 7;

export type DeliveryMethod = "uber_direct" | "jilo_own";

/**
 * GID da variant fantasma usada para cobrar frete dinâmico no Shopify Cart.
 * Vem do .env, preenchido após rodar `npm run setup:shipping`.
 */
export const SHIPPING_VARIANT_ID = import.meta.env
  .VITE_SHOPIFY_SHIPPING_VARIANT_ID as string | undefined;

if (!SHIPPING_VARIANT_ID && import.meta.env.DEV) {
  console.warn(
    "[shipping] VITE_SHOPIFY_SHIPPING_VARIANT_ID não está definido. " +
      "Frete dinâmico não funcionará. Rode `npm run setup:shipping` e configure o .env."
  );
}

export function getDeliveryMethod(totalNonShippingItems: number): DeliveryMethod {
  return totalNonShippingItems >= SHIPPING_FREE_THRESHOLD ? "jilo_own" : "uber_direct";
}

export function isFreeShipping(totalNonShippingItems: number): boolean {
  return totalNonShippingItems >= SHIPPING_FREE_THRESHOLD;
}

/**
 * True se o variantId é o do produto fantasma de frete.
 * Usado para filtrar a variant da UI e da contagem de threshold.
 */
export function isShippingVariant(variantId: string | null | undefined): boolean {
  if (!variantId || !SHIPPING_VARIANT_ID) return false;
  return variantId === SHIPPING_VARIANT_ID;
}
