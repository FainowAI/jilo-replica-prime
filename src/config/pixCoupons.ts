/**
 * Cupom PIX — sempre 5% (R19, atualizado em R61).
 * Política Jiló: PIX = PIX5 (5%, classe ORDER, combinável com Kit X%) para
 *                QUALQUER quantidade. Não há mais regra condicional por volume.
 * Manter sincronizado com Shopify Admin → Discounts (ACTIVE: PIX5 5% ORDER).
 *
 * PIX3 foi DESCONTINUADO (desativado no Shopify Admin). Continua reconhecido
 * apenas para que o reconcileDiscountsOnLoad (R57) limpe qualquer PIX3 grudento
 * que tenha sobrado em carrinhos de sessões antigas.
 *
 * IMPORTANTE: PIX é dirigido pela forma de pagamento — é EFÊMERO. Nunca deve
 * sobreviver entre sessões (ver reconcileDiscountsOnLoad no cartStore).
 */
export const PIX_COUPON_LEGACY = "PIX3"; // descontinuado; mantido só p/ reconciliação
export const PIX_COUPON_ACTIVE = "PIX5";
export const PIX_COUPON_CODES = new Set([PIX_COUPON_LEGACY, PIX_COUPON_ACTIVE]);

export function isPixCoupon(code: string): boolean {
  return PIX_COUPON_CODES.has(code.toUpperCase());
}

/**
 * Retorna sempre o cupom PIX5 a 5%, independente da quantidade.
 * O parâmetro `totalNonShippingItems` é IGNORADO — mantido apenas para não
 * quebrar os call sites existentes (a regra condicional por volume acabou em R61).
 */
export function getPixCouponForCart(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  totalNonShippingItems: number
): { code: string; percent: number } {
  return { code: PIX_COUPON_ACTIVE, percent: 5 };
}

/**
 * Total com PIX em centavos. `shopifyTotalCents` (cart.cost.totalAmount da
 * Shopify, já com PIX5 aplicado) vence quando informado — é o valor real que
 * o checkout cobra (a Shopify aloca o desconto ORDER entre produtos e frete,
 * o que a conta local não reproduz exatamente por arredondamento). Sem um
 * valor da Shopify confiável, cai no fallback local (percent sobre a base).
 */
export function computePixTotals(
  baseTotalCents: number,
  percent: number,
  shopifyTotalCents?: number | null
): { pixTotalCents: number; pixDiscountCents: number } {
  if (baseTotalCents <= 0) return { pixTotalCents: 0, pixDiscountCents: 0 };
  if (
    typeof shopifyTotalCents === "number" &&
    Number.isFinite(shopifyTotalCents) &&
    shopifyTotalCents > 0 &&
    shopifyTotalCents <= baseTotalCents
  ) {
    return {
      pixTotalCents: shopifyTotalCents,
      pixDiscountCents: baseTotalCents - shopifyTotalCents,
    };
  }
  const pixDiscountCents = Math.round((baseTotalCents * percent) / 100);
  return { pixTotalCents: baseTotalCents - pixDiscountCents, pixDiscountCents };
}
