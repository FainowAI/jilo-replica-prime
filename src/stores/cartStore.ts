import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  type ShopifyProduct,
  createShopifyCart,
  addLineToShopifyCart,
  updateShopifyCartLine,
  removeLineFromShopifyCart,
  fetchShopifyCart,
  applyDiscountCodesToCart,
  removeDiscountCodesFromCart,
  fetchCartFull,
} from '@/lib/shopify';
import { isShippingVariant } from '@/config/shipping';

export interface CartItem {
  lineId: string | null;
  product: ShopifyProduct;
  variantId: string;
  variantTitle: string;
  price: { amount: string; currencyCode: string };
  quantity: number;
  selectedOptions: Array<{ name: string; value: string }>;
}

interface CartStore {
  items: CartItem[];
  cartId: string | null;
  checkoutUrl: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  discountCodes: Array<{ code: string; applicable: boolean }>;
  cartCost: {
    totalAmount: string;
    subtotalAmount: string;
  } | null;
  cartDiscountAllocations: Array<{
    discountedAmount: { amount: string; currencyCode: string };
    title?: string;
    code?: string;
  }>;
  addItem: (item: Omit<CartItem, 'lineId'>) => Promise<void>;
  updateQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  clearCart: () => void;
  syncCart: () => Promise<void>;
  getCheckoutUrl: () => string | null;
  applyDiscountCode: (code: string) => Promise<{ success: boolean; applicable?: boolean }>;
  removeDiscountCode: () => Promise<void>;
  refreshCartDetails: () => Promise<void>;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      cartId: null,
      checkoutUrl: null,
      isLoading: false,
      isSyncing: false,
      discountCodes: [],
      cartCost: null,
      cartDiscountAllocations: [],

      addItem: async (item) => {
        const { items, cartId, clearCart } = get();
        const existingItem = items.find(i => i.variantId === item.variantId);

        // ─── REGRA R50: variant fantasma de frete é singleton ────────────────
        // Se a variant fantasma já existe no cart, NÃO somamos quantity (que é
        // o comportamento de itens normais). Removemos a linha existente do
        // Shopify e recriamos com a quantity=1 e o preço atualizado da variant.
        // O preço é atualizado server-side via edge `update-shipping-variant-price`
        // pelo `ShippingMethodSelector` ANTES desta chamada.
        if (isShippingVariant(item.variantId) && existingItem && cartId && existingItem.lineId) {
          set({ isLoading: true });
          try {
            // 1. Remove linha antiga do Shopify
            const removeResult = await removeLineFromShopifyCart(cartId, existingItem.lineId);
            if (removeResult.cartNotFound) {
              clearCart();
              return;
            }
            if (!removeResult.success) {
              console.error('[cartStore] Failed to remove stale shipping variant line');
              return;
            }

            // 2. Adiciona linha nova com preço atualizado
            const addResult = await addLineToShopifyCart(cartId, {
              variantId: item.variantId,
              quantity: 1, // SEMPRE 1 para variant fantasma
            });
            if (addResult.cartNotFound) {
              clearCart();
              return;
            }
            if (!addResult.success) {
              console.error('[cartStore] Failed to re-add shipping variant after removal');
              // Estado inconsistente: linha antiga removida, nova falhou.
              // Limpa local pra forçar re-sincronização no próximo render.
              set({ items: get().items.filter(i => i.variantId !== item.variantId) });
              return;
            }

            // 3. Atualiza store local: substitui (não soma)
            set({
              items: get().items.map(i =>
                i.variantId === item.variantId
                  ? { ...item, lineId: addResult.lineId ?? null, quantity: 1 }
                  : i
              ),
            });
            await get().refreshCartDetails();
          } catch (error) {
            console.error('[cartStore] Shipping variant REPLACE failed:', error);
          } finally {
            set({ isLoading: false });
          }
          return;
        }

        // ─── FLUXO NORMAL (marmitas + primeira inserção de variant fantasma) ─
        set({ isLoading: true });
        try {
          if (!cartId) {
            const result = await createShopifyCart({ variantId: item.variantId, quantity: item.quantity });
            if (result) {
              set({ cartId: result.cartId, checkoutUrl: result.checkoutUrl, items: [{ ...item, lineId: result.lineId }] });
            }
          } else if (existingItem) {
            const newQuantity = existingItem.quantity + item.quantity;
            if (!existingItem.lineId) return;
            const result = await updateShopifyCartLine(cartId, existingItem.lineId, newQuantity);
            if (result.success) {
              set({ items: get().items.map(i => i.variantId === item.variantId ? { ...i, quantity: newQuantity } : i) });
            } else if (result.cartNotFound) clearCart();
          } else {
            const result = await addLineToShopifyCart(cartId, { variantId: item.variantId, quantity: item.quantity });
            if (result.success) {
              set({ items: [...get().items, { ...item, lineId: result.lineId ?? null }] });
            } else if (result.cartNotFound) clearCart();
          }
          await get().refreshCartDetails();
        } catch (error) {
          console.error('Failed to add item:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      updateQuantity: async (variantId, quantity) => {
        if (quantity <= 0) { await get().removeItem(variantId); return; }
        const { items, cartId, clearCart } = get();
        const item = items.find(i => i.variantId === variantId);
        if (!item?.lineId || !cartId) return;
        set({ isLoading: true });
        try {
          const result = await updateShopifyCartLine(cartId, item.lineId, quantity);
          if (result.success) {
            set({ items: get().items.map(i => i.variantId === variantId ? { ...i, quantity } : i) });
          } else if (result.cartNotFound) clearCart();
          await get().refreshCartDetails();
        } finally { set({ isLoading: false }); }
      },

      removeItem: async (variantId) => {
        const { items, cartId, clearCart } = get();
        const item = items.find(i => i.variantId === variantId);
        if (!item?.lineId || !cartId) return;
        set({ isLoading: true });
        try {
          const result = await removeLineFromShopifyCart(cartId, item.lineId);
          if (result.success) {
            const newItems = get().items.filter(i => i.variantId !== variantId);
            newItems.length === 0 ? clearCart() : set({ items: newItems });
          } else if (result.cartNotFound) clearCart();
          await get().refreshCartDetails();
        } finally { set({ isLoading: false }); }
      },

      clearCart: () => set({ items: [], cartId: null, checkoutUrl: null, discountCodes: [], cartCost: null, cartDiscountAllocations: [] }),
      getCheckoutUrl: () => get().checkoutUrl,

      syncCart: async () => {
        const { cartId, isSyncing, clearCart } = get();
        if (!cartId || isSyncing) return;
        set({ isSyncing: true });
        try {
          const cart = await fetchShopifyCart(cartId);
          if (!cart || cart.totalQuantity === 0) clearCart();
        } catch (error) {
          console.error('Failed to sync cart:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      applyDiscountCode: async (code: string) => {
        const { cartId, clearCart } = get();
        if (!cartId) return { success: false };
        set({ isLoading: true });
        try {
          const result = await applyDiscountCodesToCart(cartId, [code]);
          if (result.cartNotFound) { clearCart(); return { success: false }; }
          if (result.success && result.discountCodes) {
            set({ discountCodes: result.discountCodes });
            const applied = result.discountCodes.find(
              (dc) => dc.code.toUpperCase() === code.toUpperCase()
            );
            return { success: true, applicable: applied?.applicable ?? false };
          }
          return { success: false };
        } catch (error) {
          console.error('Failed to apply discount code:', error);
          return { success: false };
        } finally {
          set({ isLoading: false });
        }
      },

      refreshCartDetails: async () => {
        const { cartId } = get();
        if (!cartId) return;
        try {
          const cart = await fetchCartFull(cartId);
          if (!cart) return;
          set({
            cartCost: cart.cost ? {
              totalAmount: cart.cost.totalAmount.amount,
              subtotalAmount: cart.cost.subtotalAmount.amount,
            } : null,
            cartDiscountAllocations: cart.discountAllocations || [],
          });
        } catch (error) {
          console.error('Failed to refresh cart details:', error);
        }
      },

      removeDiscountCode: async () => {
        const { cartId, clearCart } = get();
        if (!cartId) return;
        set({ isLoading: true });
        try {
          const result = await removeDiscountCodesFromCart(cartId);
          if (result.cartNotFound) { clearCart(); return; }
          if (result.success) set({ discountCodes: [] });
        } catch (error) {
          console.error('Failed to remove discount code:', error);
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'shopify-cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items, cartId: state.cartId, checkoutUrl: state.checkoutUrl, discountCodes: state.discountCodes, cartCost: state.cartCost, cartDiscountAllocations: state.cartDiscountAllocations }),
    }
  )
);
