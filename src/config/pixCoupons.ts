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
