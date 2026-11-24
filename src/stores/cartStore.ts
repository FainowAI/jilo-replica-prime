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
  formatCheckoutUrl,
} from '@/lib/shopify';
import { isShippingVariant, SHIPPING_FREE_THRESHOLD } from '@/config/shipping';
import { PIX_COUPON_CODES } from '@/config/pixCoupons';
import { reconcileCartItems, type CartAdjustment, type ServerCartLine } from '@/lib/cartReconcile';
import { analytics } from '@/analytics/events';

export interface CartItem {
  lineId: string | null;
  product: ShopifyProduct;
  variantId: string;
  variantTitle: string;
  price: { amount: string; currencyCode: string };
  quantity: number;
  selectedOptions: Array<{ name: string; value: string }>;
}

// Controle de corrida entre refreshCartDetails e mutações de linha (add/update/remove).
// Um refresh iniciado antes de uma mutação terminar pode ver o servidor SEM a linha
// nova e apagaria o item recém-adicionado na conciliação. Por isso o refresh só
// concilia `items` se nenhuma mutação (de terceiros) estava em voo e nenhuma começou
// ou terminou durante o fetch. Contadores de módulo (não persistidos).
let cartMutationSeq = 0;
let cartMutationsInFlight = 0;

function withMutation<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  return async (...args: A): Promise<void> => {
    cartMutationsInFlight += 1;
    cartMutationSeq += 1;
    try {
      await fn(...args);
    } finally {
      cartMutationsInFlight = Math.max(0, cartMutationsInFlight - 1);
      cartMutationSeq += 1;
    }
  };
}

/** Só para testes: zera os contadores de mutação. */
export function __resetCartMutationState() {
  cartMutationSeq = 0;
  cartMutationsInFlight = 0;
}

interface CartStore {
  items: CartItem[];
  cartAdjustments: CartAdjustment[];
  cartId: string | null;
  checkoutUrl: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  pixReconciled: boolean;
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
  shopifyHasShippingLine: boolean;
  addItem: (item: Omit<CartItem, 'lineId'>) => Promise<void>;
  updateQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  clearCart: () => void;
  syncCart: () => Promise<void>;
  getCheckoutUrl: () => string | null;
  applyDiscountCode: (code: string) => Promise<{ success: boolean; applicable?: boolean }>;
  reconcileDiscountsOnLoad: () => Promise<void>;
  removeDiscountCode: () => Promise<void>;
  /**
   * Re-busca o cart na Shopify e concilia `items` com as linhas reais (cartReconcile).
   * `opts.inMutation`: chamado de dentro de uma mutação de linha (ela própria não conta como "em voo").
   * Devolve os ajustes desta chamada (vazio se nada mudou ou se a conciliação foi pulada pela corrida).
   */
  refreshCartDetails: (opts?: { inMutation?: boolean }) => Promise<CartAdjustment[]>;
  clearCartAdjustments: () => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      cartAdjustments: [],
      cartId: null,
      checkoutUrl: null,
      isLoading: false,
      isSyncing: false,
      pixReconciled: false,
      discountCodes: [],
      cartCost: null,
      cartDiscountAllocations: [],
      shopifyHasShippingLine: false,

      addItem: withMutation(async (item: Omit<CartItem, 'lineId'>) => {
        const { items, cartId, clearCart } = get();
        const existingItem = items.find(i => i.variantId === item.variantId);

        const nonShippingTotal = (its: CartItem[]) =>
          its.filter(i => !isShippingVariant(i.variantId)).reduce((s, i) => s + i.quantity, 0);
        const totalAntes = nonShippingTotal(items);

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

            // 3. Verificação pós-add (R55): confirma que a Storefront REALMENTE adicionou
            // a linha. Se o produto fantasma sair do estado correto (ACTIVE + publicado no
            // Online Store — ver R54), o cartLinesAdd falha e a linha não entra. Após Sprint
            // 5.0 o produto está ACTIVE + publicado (resolve o caso conhecido), mas mantemos
            // a verificação como defesa em profundidade contra regressões de publicação/status.
            const verifyCart = await fetchCartFull(cartId);
            const variantInCart = verifyCart?.lines.edges.some(
              (edge) => edge.node.merchandise.id === item.variantId
            );

            if (!variantInCart) {
              console.error(
                '[cartStore] CRITICAL: Storefront returned success for cartLinesAdd of shipping variant, ' +
                'but the line is NOT in the cart after re-fetch. Possible silent rejection.',
                {
                  cartId,
                  variantId: item.variantId,
                  cartLineCount: verifyCart?.lines.edges.length ?? 0,
                  cartLines: verifyCart?.lines.edges.map(e => ({
                    id: e.node.id,
                    merchandiseId: e.node.merchandise.id,
                    title: e.node.merchandise.product?.title,
                  })),
                }
              );
              // Reverte items[] local: remove a variant fantasma que NÃO entrou.
              // ShippingMethodSelector vai re-tentar no próximo render via lastSyncedFeeRef = null.
              set({
                items: get().items.filter(i => i.variantId !== item.variantId),
              });
              await get().refreshCartDetails({ inMutation: true });
              return;
            }

            // 4. Atualiza store local: substitui (não soma)
            set({
              items: get().items.map(i =>
                i.variantId === item.variantId
                  ? { ...item, lineId: addResult.lineId ?? null, quantity: 1 }
                  : i
              ),
            });
            await get().refreshCartDetails({ inMutation: true });
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
          } else {
            // Item já no local: lineId nulo => a conciliação do refresh preenche (ou remove o
            // item se a Shopify o zerou) e tentamos de novo uma vez.
            let target = existingItem;
            if (target && !target.lineId) {
              await get().refreshCartDetails({ inMutation: true });
              target = get().items.find(i => i.variantId === item.variantId);
            }
            if (target) {
              if (target.lineId) {
                const newQuantity = target.quantity + item.quantity;
                const result = await updateShopifyCartLine(cartId, target.lineId, newQuantity);
                if (result.success) {
                  set({ items: get().items.map(i => i.variantId === item.variantId ? { ...i, quantity: newQuantity } : i) });
                } else if (result.cartNotFound) clearCart();
              }
            } else {
              const result = await addLineToShopifyCart(cartId, { variantId: item.variantId, quantity: item.quantity });
              if (result.success) {
                // R55: validação pós-add APENAS para variant fantasma de frete.
                // Marmitas: a Shopify pode zerar a linha em silêncio (sem estoque); quem trata isso é a
                // conciliação do refreshCartDetails (cartReconcile), não esta validação.
                // A variant fantasma também é ACTIVE + publicada no Online Store (R54) e a
                // Storefront aceita, mas mantemos a verificação como defesa contra regressões.
                if (isShippingVariant(item.variantId)) {
                  const verifyCart = await fetchCartFull(cartId);
                  const variantInCart = verifyCart?.lines.edges.some(
                    (edge) => edge.node.merchandise.id === item.variantId
                  );

                  if (!variantInCart) {
                    console.error(
                      '[cartStore] CRITICAL: Storefront returned success for cartLinesAdd of shipping variant ' +
                      '(first insertion), but the line is NOT in the cart after re-fetch.',
                      {
                        cartId,
                        variantId: item.variantId,
                        cartLineCount: verifyCart?.lines.edges.length ?? 0,
                      }
                    );
                    // NÃO atualiza items[] local — variant fantasma não entrou.
                    await get().refreshCartDetails({ inMutation: true });
                    return;
                  }
                }

                set({ items: [...get().items, { ...item, lineId: result.lineId ?? null }] });
              } else if (result.cartNotFound) clearCart();
            }
          }
          await get().refreshCartDetails({ inMutation: true });
          if (!isShippingVariant(item.variantId)) {
            analytics.itemAdicionado({
              handle: item.product.node.handle,
              grupo: item.product.node.productType || item.product.node.tags?.[0] || null,
              qtd: item.quantity,
            });
            const totalDepois = nonShippingTotal(get().items);
            if (totalDepois > 0 && totalDepois % SHIPPING_FREE_THRESHOLD === 0 && totalAntes % SHIPPING_FREE_THRESHOLD !== 0) {
              analytics.kitMontado({ tamanho: totalDepois });
            }
          }
        } catch (error) {
          console.error('Failed to add item:', error);
        } finally {
          set({ isLoading: false });
        }
      }),

      updateQuantity: async (variantId, quantity) => {
        if (quantity <= 0) { await get().removeItem(variantId); return; }
        await withMutation(async () => {
          const { cartId, clearCart } = get();
          if (!cartId) return;
          let item = get().items.find(i => i.variantId === variantId);
          if (item && !item.lineId) {
            // lineId nulo: a conciliação do refresh preenche (ou remove o item); tenta de novo uma vez.
            await get().refreshCartDetails({ inMutation: true });
            item = get().items.find(i => i.variantId === variantId);
          }
          if (!item?.lineId) return;
          set({ isLoading: true });
          try {
            const result = await updateShopifyCartLine(cartId, item.lineId, quantity);
            if (result.success) {
              set({ items: get().items.map(i => i.variantId === variantId ? { ...i, quantity } : i) });
            } else if (result.cartNotFound) clearCart();
            await get().refreshCartDetails({ inMutation: true });
          } finally { set({ isLoading: false }); }
        })();
      },

      removeItem: async (variantId) => {
        await withMutation(async () => {
          const { cartId, clearCart } = get();
          if (!cartId) return;
          let item = get().items.find(i => i.variantId === variantId);
          if (item && !item.lineId) {
            await get().refreshCartDetails({ inMutation: true });
            item = get().items.find(i => i.variantId === variantId);
          }
          if (!item?.lineId) return;
          set({ isLoading: true });
          try {
            const result = await removeLineFromShopifyCart(cartId, item.lineId);
            if (result.success) {
              const newItems = get().items.filter(i => i.variantId !== variantId);
              newItems.length === 0 ? clearCart() : set({ items: newItems });
            } else if (result.cartNotFound) clearCart();
            // Falha que não é cartNotFound: o refresh concilia (tira o item se a linha já não existe no servidor).
            await get().refreshCartDetails({ inMutation: true });
          } finally { set({ isLoading: false }); }
        })();
      },

      clearCartAdjustments: () => set({ cartAdjustments: [] }),
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
            await get().refreshCartDetails();
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

      reconcileDiscountsOnLoad: async () => {
        // Roda no máximo uma vez por sessão de carregamento.
        if (get().pixReconciled) return;
        set({ pixReconciled: true });

        const { cartId, discountCodes, clearCart } = get();
        if (!cartId) return;

        const hasPix = discountCodes.some((dc) =>
          PIX_COUPON_CODES.has(dc.code.toUpperCase())
        );
        if (!hasPix) return; // nada de PIX grudento — não mexe

        // Mantém apenas cupons NÃO-PIX (manuais sobrevivem).
        const keep = discountCodes.filter(
          (dc) => !PIX_COUPON_CODES.has(dc.code.toUpperCase())
        );

        // Otimista: limpa PIX do estado local já, pra UI não piscar "PIX aplicado".
        set({ discountCodes: keep });

        set({ isLoading: true });
        try {
          if (keep.length === 0) {
            // Sem manuais → limpa todos os códigos do Shopify Cart (caminho conhecido).
            const result = await removeDiscountCodesFromCart(cartId);
            if (result.cartNotFound) { clearCart(); return; }
            if (result.success) set({ discountCodes: [] });
          } else {
            // Reaplica SÓ os manuais — cartDiscountCodesUpdate substitui o conjunto,
            // então o PIX sai e os manuais ficam.
            const keepCodes = keep.map((dc) => dc.code);
            const result = await applyDiscountCodesToCart(cartId, keepCodes);
            if (result.cartNotFound) { clearCart(); return; }
            if (result.success && result.discountCodes) {
              set({ discountCodes: result.discountCodes });
            }
          }
          await get().refreshCartDetails();
        } catch (error) {
          console.error("[cartStore] reconcileDiscountsOnLoad falhou:", error);
        } finally {
          set({ isLoading: false });
        }
      },

      refreshCartDetails: async (opts) => {
        const { cartId } = get();
        if (!cartId) return [];
        const ownMutation = opts?.inMutation ? 1 : 0;
        const seqAtStart = cartMutationSeq;
        const inFlightAtStart = cartMutationsInFlight - ownMutation;
        try {
          const cart = await fetchCartFull(cartId);
          if (!cart) return [];

          // Conciliação items ↔ linhas da Shopify (a Shopify zera linhas sem estoque em
          // silêncio e não as repõe). Pulada se houve/há mutação de linha de terceiros:
          // o servidor pode ainda não refletir o item recém-adicionado.
          let adjustments: CartAdjustment[] = [];
          let reconciledItems: CartItem[] | null = null;
          let zeroLineIds: string[] = [];
          const raced =
            inFlightAtStart > 0 ||
            cartMutationsInFlight - ownMutation > 0 ||
            cartMutationSeq !== seqAtStart;
          if (!raced) {
            const serverLines: ServerCartLine[] = (cart.lines?.edges || []).map(
              (e: { node: ServerCartLine }) => e.node
            );
            const r = reconcileCartItems(get().items, serverLines);
            adjustments = r.adjustments;
            reconciledItems = r.items;
            zeroLineIds = r.zeroLineIds;
          }

          // Allocations de nível cart — manter SOMENTE automáticas (sem `code`).
          // Descontos por código (PIX3/PIX5 classe ORDER, cupons manuais) NÃO entram
          // aqui: o TOTAL da página reflete só o desconto de Kit (R53/R60); cupom é
          // exibido como "Aplicado ✓" e aplicado no checkout Shopify.
          const cartLevelAllocations = (cart.discountAllocations || []).filter(
            (alloc: { code?: string }) => !alloc.code
          );

          // Agrega as allocations de LINHA (descontos de kit do tipo DiscountProducts,
          // que alocam por linha e nunca aparecem em cart.discountAllocations).
          // Soma discountedAmount.amount agrupando por title. (Sprint 5.1 — necessário
          // para EXIBIR o desconto de kit no carrinho.)
          const lineTotalsByTitle = new Map<
            string,
            { amount: number; currencyCode: string }
          >();
          for (const edge of cart.lines?.edges || []) {
            for (const alloc of edge.node?.discountAllocations || []) {
              // Pula descontos por código (PIX/cupom) — só o Kit automático é agregado.
              if (alloc.code) continue;
              const title = alloc.title || 'Desconto de kit';
              const amount = parseFloat(alloc.discountedAmount?.amount ?? '0');
              if (!amount) continue;
              const currencyCode = alloc.discountedAmount?.currencyCode ?? 'BRL';
              const existing = lineTotalsByTitle.get(title);
              if (existing) {
                existing.amount += amount;
              } else {
                lineTotalsByTitle.set(title, { amount, currencyCode });
              }
            }
          }

          const aggregatedLineAllocations = Array.from(
            lineTotalsByTitle.entries()
          ).map(([title, { amount, currencyCode }]) => ({
            discountedAmount: { amount: amount.toFixed(2), currencyCode },
            title,
          }));

          // Verdade do servidor: a linha de frete (variant fantasma) está no cart?
          // O hard-block do Carrinho (R59) usa isso em vez de comparar subtotais — os
          // descontos de Kit são "Amount off products" (DiscountProducts) e reduzem
          // o subtotalAmount, então a comparação de totais nunca batia em pedidos ≥7.
          const hasShippingLine = cart.lines.edges.some((edge) =>
            isShippingVariant(edge.node.merchandise.id)
          );
          // Linhas zeradas pela Shopify: remove-as lá também. Falha aqui não quebra o refresh.
          if (zeroLineIds.length > 0) {
            try {
              await removeLineFromShopifyCart(cartId, zeroLineIds);
            } catch (zeroError) {
              console.error('[cartStore] Failed to remove zero-quantity lines:', zeroError);
            }
          }

          if (reconciledItems && reconciledItems.every((i) => isShippingVariant(i.variantId))) {
            // Nada de marmita sobrou no servidor: encerra o cart local (mesmo critério do removeItem).
            if (get().items.length > 0 && reconciledItems.length !== get().items.length) {
              get().clearCart();
              set({ cartAdjustments: [...get().cartAdjustments, ...adjustments] });
              return adjustments;
            }
          }

          set({
            ...(reconciledItems ? { items: reconciledItems } : {}),
            ...(adjustments.length > 0
              ? { cartAdjustments: [...get().cartAdjustments, ...adjustments] }
              : {}),
            // R80 (2026-09-25): a Shopify assina o checkoutUrl com o estado do cart; a URL
            // gravada na criação NÃO carrega mudanças posteriores (PIX5 aplicado aqui via
            // cartDiscountCodesUpdate chegava ao checkout sem o cupom: 132,93 em vez de
            // 126,29). A doc manda re-requisitar quando "stale" — a CART_FULL_QUERY já traz
            // a URL fresca, então basta gravá-la a cada refresh (applyDiscountCode chama
            // refreshCartDetails logo após aplicar o cupom).
            ...(cart.checkoutUrl ? { checkoutUrl: formatCheckoutUrl(cart.checkoutUrl) } : {}),
            cartCost: cart.cost ? {
              totalAmount: cart.cost.totalAmount.amount,
              subtotalAmount: cart.cost.subtotalAmount.amount,
            } : null,
            cartDiscountAllocations: [
              ...cartLevelAllocations,
              ...aggregatedLineAllocations,
            ],
            shopifyHasShippingLine: hasShippingLine,
          });
          return adjustments;
        } catch (error) {
          console.error('Failed to refresh cart details:', error);
          return [];
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
      partialize: (state) => ({ items: state.items, cartId: state.cartId, checkoutUrl: state.checkoutUrl, discountCodes: state.discountCodes }),
    }
  )
);
