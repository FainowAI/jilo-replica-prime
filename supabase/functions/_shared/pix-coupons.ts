/**
 * Espelho de src/config/pixCoupons.ts (PIX_COUPON_ACTIVE / PIX_COUPON_CODES / isPixCoupon).
 * PIX5 é o cupom ativo (5%, classe ORDER). PIX3 está descontinuado no Shopify
 * Admin mas continua reconhecido aqui só para detectar carrinhos antigos —
 * nunca é aplicado pelo servidor. Mudança de cupom ativo exige os dois lados.
 */
export const PIX_COUPON_ACTIVE = "PIX5";
export const PIX_COUPON_CODES: ReadonlySet<string> = new Set(["PIX3", PIX_COUPON_ACTIVE]);

export function isPixCoupon(code: string): boolean {
  return PIX_COUPON_CODES.has(code.toUpperCase());
}
