import { SHIPPING_FREE_THRESHOLD } from "@/config/shipping";

/**
 * Cupons PIX condicionais à quantidade (R19).
 * Política Jiló: < SHIPPING_FREE_THRESHOLD marmitas → PIX5 (5%, NÃO combinável)
 *                >= SHIPPING_FREE_THRESHOLD          → PIX3 (3%, combinável com Kit X%)
 * Manter sincronizado com Shopify Admin → Discounts (confirmado ACTIVE: PIX5, PIX3).
 *
 * IMPORTANTE: PIX é dirigido pela forma de pagamento — é EFÊMERO. Nunca deve
 * sobreviver entre sessões (ver reconcileDiscountsOnLoad no cartStore).
 */
export const PIX_COUPON_HIGH_VOLUME = "PIX3";
export const PIX_COUPON_LOW_VOLUME = "PIX5";
export const PIX_COUPON_CODES = new Set([PIX_COUPON_HIGH_VOLUME, PIX_COUPON_LOW_VOLUME]);

export function isPixCoupon(code: string): boolean {
  return PIX_COUPON_CODES.has(code.toUpperCase());
}

export function getPixCouponForCart(totalNonShippingItems: number): { code: string; percent: number } {
  if (totalNonShippingItems >= SHIPPING_FREE_THRESHOLD) {
    return { code: PIX_COUPON_HIGH_VOLUME, percent: 3 };
  }
  return { code: PIX_COUPON_LOW_VOLUME, percent: 5 };
}
