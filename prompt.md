Bugfix: infinite render loop no CartDrawer (Sprint 4.1)
Sintoma
Warning: The result of getSnapshot should be cached to avoid an infinite loop
Uncaught Error: Maximum update depth exceeded ... at CartDrawer
Disparado assim que o CartDrawer monta, quebrando a página.
Causa
Dois bugs introduzidos no PROMPT 10 do plano original:

useVisibleCartItems chama state.items.filter(...) dentro do selector do Zustand. filter retorna um array novo a cada execução — referência diferente a cada render — então o useSyncExternalStore do React acha que o snapshot mudou e força re-render. Loop.
useEffect do <ShippingMethodSelector> depende de items (referência do store) E chama addItem/removeItem que mutam o store. Combinado com o bug 1, isso vira loop secundário.

Correção
Edite dois arquivos, pequeno cirúrgico, sem mexer em mais nada.
1. src/hooks/useNonShippingTotalItems.ts — substitua o conteúdo inteiro
typescriptimport { useMemo } from "react";
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

Nota sobre CartItem: o import type { CartItem } from "@/stores/cartStore" precisa que CartItem seja exportado do store. Se hoje não está exportado, abra src/stores/cartStore.ts e troque interface CartItem { por export interface CartItem {. Mudança benigna, sem impacto em mais nada.

2. src/components/ShippingMethodSelector.tsx — alterar SOMENTE o useEffect de sincronização
Localize o segundo useEffect (com comentário // Sincroniza variant fantasma no cart Shopify) e substitua o array de dependências + a forma como shippingItem é lido.
De:
typescript  // Sincroniza variant fantasma no cart Shopify
  useEffect(() => {
    if (!SHIPPING_VARIANT_ID) return;
    const shippingItem = items.find((i) => i.variantId === SHIPPING_VARIANT_ID);

    // ... resto do effect ...
  }, [isFree, quote, cepParams, items, addItem, removeItem]);
Para:
typescript  // Sincroniza variant fantasma no cart Shopify
  useEffect(() => {
    if (!SHIPPING_VARIANT_ID) return;
    // Lê snapshot do store de forma imperativa — NÃO depender de `items` no array
    // de deps, senão o effect roda sempre que qualquer item do cart muda (loop com
    // addItem/removeItem que ele próprio chama).
    const currentItems = useCartStore.getState().items;
    const shippingItem = currentItems.find((i) => i.variantId === SHIPPING_VARIANT_ID);

    // Caso 1: frete grátis — remover se existir
    if (isFree) {
      if (shippingItem) {
        removeItem(SHIPPING_VARIANT_ID);
        lastSyncedFeeRef.current = null;
      }
      return;
    }

    // Caso 2: cotação ainda não chegou ou CEP não validado — não fazer nada
    if (!quote || !cepParams) return;

    // Caso 3: cotação igual à última sincronizada — nada a fazer
    if (lastSyncedFeeRef.current === quote.fee_cents && shippingItem) return;

    // Caso 4: precisa sincronizar — atualiza preço, depois (re)adiciona ao cart
    const sync = async () => {
      try {
        await updateShippingVariantPrice(quote.fee_cents);

        // Re-lê snapshot DENTRO do async — pode ter mudado durante o debounce
        const latestItems = useCartStore.getState().items;
        const latestShippingItem = latestItems.find(
          (i) => i.variantId === SHIPPING_VARIANT_ID
        );

        if (latestShippingItem) {
          await removeItem(SHIPPING_VARIANT_ID);
        }

        await addItem({
          product: buildShippingVariantProduct(quote.fee_cents),
          variantId: SHIPPING_VARIANT_ID,
          variantTitle: "Default",
          price: { amount: (quote.fee_cents / 100).toFixed(2), currencyCode: "BRL" },
          quantity: 1,
          selectedOptions: [],
        });

        lastSyncedFeeRef.current = quote.fee_cents;
      } catch (err) {
        console.error("[ShippingMethodSelector] failed to sync shipping variant:", err);
      }
    };

    // Debounce 300ms para evitar race com Shopify Cart API quando cliente muda quantidades rápido
    const timer = setTimeout(sync, 300);
    return () => clearTimeout(timer);
    // PROPOSITAL: `items` NÃO está nas deps — usamos getState() para snapshot fresh
    // sem encadear loop. O effect re-roda quando isFree, quote ou cepParams mudam.
  }, [isFree, quote, cepParams, addItem, removeItem]);
Também remova a linha const items = useCartStore((s) => s.items); do topo do componente (não é mais usada — todos os reads agora são via getState() dentro do effect). Mantenha addItem e removeItem:
typescript  // remover esta linha:
  // const items = useCartStore((s) => s.items);

  // manter estas:
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
Por que essa correção funciona

Selector do Zustand precisa retornar referência estável quando o estado relevante não mudou. state.items (a referência do array no store) é estável; state.items.filter(...) não é. Mover o filter para useMemo fora do selector resolve.
useCartStore.getState() lê o estado fora do ciclo de subscription — não causa re-render, não cria dependência de hook, é leitura imperativa. Combinado com remoção de items das deps, o effect só roda quando preço/CEP/threshold realmente mudam, não quando qualquer item entra ou sai do cart.

Validação
Depois de aplicar:

npm run dev
Abrir o site, clicar para abrir o CartDrawer — o erro Maximum update depth exceeded deve sumir
Adicionar/remover marmitas — não deve haver warning de getSnapshot
Ir para /carrinho, verificar CEP, ver cotação Uber chegar — variant fantasma é adicionada uma vez só (sem flickering)
Cruzar threshold de 7 itens — variant fantasma some/aparece sem loop

NÃO ALTERAR

A lógica do useShippingQuote (TanStack Query — está correto)
A lógica de cart attributes no Carrinho.tsx
O store em si (cartStore.ts) — só exportar CartItem se ainda não estiver exportado
O primeiro useEffect do componente (que dispara onQuoteChange) — esse está correto