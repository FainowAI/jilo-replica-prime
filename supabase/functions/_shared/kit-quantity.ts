import { SHIPPING_FREE_THRESHOLD } from "./shipping-constants.ts";

/**
 * Espelho de src/config/kitQuantity.ts (KIT_STEP / isValidKitQuantity).
 * Fonte do número é o frontend (src/config/shipping.ts via
 * SHIPPING_FREE_THRESHOLD); mudança de threshold exige atualizar os dois
 * lados (frontend e este arquivo, via ./shipping-constants.ts).
 */
export const KIT_STEP = SHIPPING_FREE_THRESHOLD;

/** R56: quantidade válida — 0..KIT_STEP-1 livre, ou múltiplo exato de KIT_STEP. */
export function isValidKitQuantity(totalNonShippingItems: number): boolean {
  if (totalNonShippingItems < KIT_STEP) return true;
  return totalNonShippingItems % KIT_STEP === 0;
}
