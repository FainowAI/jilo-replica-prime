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

/**
 * Promessa institucional de entrega ao cliente: até 48h, INDEPENDENTE do método
 * (Uber Direct, frota Jilo ou Lalamove). O tempo "~Ymin" exibido na cotação Uber
 * é só a janela de coleta/transporte da Uber — a promessa ao cliente é sempre 48h.
 * Fonte única do texto para não espalhar a string literal pela UI.
 */
export const DELIVERY_PROMISE_LABEL = "Entrega em até 48h";

export type DeliveryMethod = "uber_direct" | "jilo_own" | "lalamove";

/** Frete fixo da Entrega Lalamove (fallback fora do raio Uber, <7 marmitas).
 *  Espelha o shipping rate cadastrado no painel Shopify. Item 5, jun/2026. */
export const LALAMOVE_FIXED_FEE_CENTS = 1990; // R$ 19,90

/** Label legível da Entrega Lalamove para uso na UI. */
export const LALAMOVE_METHOD_LABEL = "Entrega Lalamove";

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


export function isShippingVariant(variantId: string | null | undefined): boolean {
  if (!variantId || !SHIPPING_VARIANT_ID) return false;
  return variantId === SHIPPING_VARIANT_ID;
}