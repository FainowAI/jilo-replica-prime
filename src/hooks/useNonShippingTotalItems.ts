import { useMemo } from "react";
import { useCartStore, type CartItem } from "@/stores/cartStore";
import { isShippingVariant } from "@/config/shipping";

/**
 * Conta marmitas reais no cart, ignorando a variant fantasma de frete.
 * Use este hook em qualquer lugar que precise da regra de threshold (R34).
 *
 * IMPORTANTE: o selector retorna `state.items` (referência ESTÁVEL do store).
 * A derivação acontece em useMemo fora do selector — caso contrário, qualquer
 * `.filter`/`.map`/`.reduce` dentro do selector cria objeto novo a cada render
 * e dispara loop infinito no useSyncExternalStore.
 */
export function useNonShippingTotalItems(): number {
  const items = useCartStore((s) => s.items);
  return useMemo(
    () =>
      items
        .filter((item) => !isShippingVariant(item.variantId))
        .reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );
}

/**
 * Lista de itens visíveis ao cliente (sem a variant fantasma).
 * Mesma regra do hook acima: filter fora do selector.
 */
export function useVisibleCartItems(): CartItem[] {
  const items = useCartStore((s) => s.items);
  return useMemo(
    () => items.filter((item) => !isShippingVariant(item.variantId)),
    [items]
  );
}
