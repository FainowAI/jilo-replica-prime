/**
 * Constantes de frete compartilhadas entre Edge Functions.
 *
 * IMPORTANTE: Este arquivo deve ficar sincronizado com
 * src/config/shipping.ts (frontend). Mudanças no threshold exigem
 * atualização em ambos os lugares.
 */

export const SHIPPING_FREE_THRESHOLD = 7;

/** Frete fixo da Entrega Lalamove (fallback fora do raio Uber, <7 marmitas).
 *  Espelha o shipping rate cadastrado no painel Shopify. Item 5, jun/2026.
 *  Mantido em sincronia com src/config/shipping.ts. */
export const LALAMOVE_FIXED_FEE_CENTS = 1990; // R$ 19,90

export type DeliveryMethod = "uber_direct" | "jilo_own" | "lalamove";

export function getDeliveryMethod(totalNonShippingItems: number): DeliveryMethod {
  return totalNonShippingItems >= SHIPPING_FREE_THRESHOLD ? "jilo_own" : "uber_direct";
}
