/**
 * Constantes de frete compartilhadas entre Edge Functions.
 *
 * IMPORTANTE: Este arquivo deve ficar sincronizado com
 * src/config/shipping.ts (frontend). Mudanças no threshold exigem
 * atualização em ambos os lugares.
 */

export const SHIPPING_FREE_THRESHOLD = 7;

export type DeliveryMethod = "uber_direct" | "jilo_own";

export function getDeliveryMethod(totalNonShippingItems: number): DeliveryMethod {
  return totalNonShippingItems >= SHIPPING_FREE_THRESHOLD ? "jilo_own" : "uber_direct";
}
