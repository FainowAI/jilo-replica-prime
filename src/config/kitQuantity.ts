import { SHIPPING_FREE_THRESHOLD } from "@/config/shipping";

/**
 * Tamanho do "kit" logístico = mesmo threshold do frete grátis (R34).
 *
 * Regra R56: a partir de KIT_STEP marmitas, os pedidos saem em sacola fechada
 * da Jiló, então só são vendidos em múltiplos exatos de KIT_STEP (7, 14, 21,
 * 28, 35...). De 0 a KIT_STEP-1 (1 a 6) o pedido segue avulso (frete Uber Direct).
 *
 * FONTE ÚNICA do número 7 no frontend: NÃO duplicar. Mudança de threshold só
 * em src/config/shipping.ts (e no espelho supabase/functions/_shared/shipping-constants.ts).
 */
export const KIT_STEP = SHIPPING_FREE_THRESHOLD;

/** R56: quantidade válida — 0..KIT_STEP-1 livre, ou múltiplo exato de KIT_STEP. */
export function isValidKitQuantity(totalNonShippingItems: number): boolean {
  if (totalNonShippingItems < KIT_STEP) return true;
  return totalNonShippingItems % KIT_STEP === 0;
}

export type KitQuantityGuidance = {
  valid: boolean;
  /** múltiplo de KIT_STEP imediatamente >= ao total atual */
  nextMultiple: number;
  /** múltiplo de KIT_STEP imediatamente <= ao total atual (>= KIT_STEP) */
  prevMultiple: number;
  /** quantas faltam pra fechar o próximo kit */
  toAdd: number;
  /** quantas remover pra voltar ao kit anterior */
  toRemove: number;
};

/** Orientação genérica (8, 30, 45...) sem depender de tiers hardcoded. */
export function getKitQuantityGuidance(totalNonShippingItems: number): KitQuantityGuidance {
  const valid = isValidKitQuantity(totalNonShippingItems);
  const nextMultiple = Math.ceil(totalNonShippingItems / KIT_STEP) * KIT_STEP;
  const prevMultiple = Math.floor(totalNonShippingItems / KIT_STEP) * KIT_STEP;
  return {
    valid,
    nextMultiple,
    prevMultiple,
    toAdd: nextMultiple - totalNonShippingItems,
    toRemove: totalNonShippingItems - prevMultiple,
  };
}
