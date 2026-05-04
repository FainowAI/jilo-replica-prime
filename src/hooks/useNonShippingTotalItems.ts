import { useCartStore } from "@/stores/cartStore";
import { isShippingVariant } from "@/config/shipping";

/**
 * Conta marmitas reais no cart, ignorando a variant fantasma de frete.
 * Use este hook em qualquer lugar que precise da regra de threshold (R34).
 */
export function useNonShippingTotalItems(): number {
  return useCartStore((state) =>
    state.items
      .filter((item) => !isShippingVariant(item.variantId))
      .reduce((sum, item) => sum + item.quantity, 0)
  );
}

/**
 * Lista de itens visíveis ao cliente (sem a variant fantasma).
 * Use para renderizar a tabela do carrinho ou os itens do drawer.
 */
export function useVisibleCartItems() {
  return useCartStore((state) =>
    state.items.filter((item) => !isShippingVariant(item.variantId))
  );
}
