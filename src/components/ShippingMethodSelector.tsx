import { useEffect, useRef } from "react";
import { Truck, Loader2, Info } from "lucide-react";
import { SHIPPING_FREE_THRESHOLD, SHIPPING_VARIANT_ID, isFreeShipping } from "@/config/shipping";
import { useShippingQuote } from "@/hooks/useShippingQuote";
import { updateShippingVariantPrice } from "@/lib/uberDirect";
import { useCartStore } from "@/stores/cartStore";
import type { CepValidationResult } from "@/lib/cepValidator";
import type { ShopifyProduct } from "@/lib/shopify";

interface ShippingMethodSelectorProps {
  totalNonShippingItems: number;
  deliveryCheck: CepValidationResult | null;
  onQuoteChange?: (quoteId: string | null, feeCents: number) => void;
}

/**
 * Mock mínimo da variant fantasma para satisfazer o tipo CartItem.
 * Como o produto é status:draft, não vem de query — montamos aqui.
 */
function buildShippingVariantProduct(feeCents: number): ShopifyProduct {
  const priceReais = (feeCents / 100).toFixed(2);
  return {
    node: {
      id: "shipping-product-mock",
      title: "Frete Uber Direct",
      description: "Frete cobrado via Uber Direct",
      handle: "frete-uber-direct",
      productType: "Shipping",
      tags: ["__internal_shipping"],
      priceRange: {
        minVariantPrice: { amount: priceReais, currencyCode: "BRL" },
      },
      images: { edges: [] },
      variants: { edges: [] },
      options: [],
    },
  };
}

export default function ShippingMethodSelector({
  totalNonShippingItems,
  deliveryCheck,
  onQuoteChange,
}: ShippingMethodSelectorProps) {
  const isFree = isFreeShipping(totalNonShippingItems);
  const itemsRemaining = SHIPPING_FREE_THRESHOLD - totalNonShippingItems;
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const lastSyncedFeeRef = useRef<number | null>(null);

  const cepParams = deliveryCheck?.isDeliverable && deliveryCheck.cepInfo
    ? {
        dropoff_cep: deliveryCheck.cepInfo.cep,
        dropoff_address: deliveryCheck.cepInfo.logradouro || "Endereço",
        dropoff_city: deliveryCheck.cepInfo.localidade,
        dropoff_state: deliveryCheck.cepInfo.uf,
      }
    : null;

  const { quote, loading, error } = useShippingQuote(totalNonShippingItems, cepParams);

  // Reporta o quote ativo para o Carrinho (que vai usar nos cart attributes)
  useEffect(() => {
    if (!onQuoteChange) return;
    if (isFree) onQuoteChange(null, 0);
    else if (quote) onQuoteChange(quote.quote_id, quote.fee_cents);
  }, [isFree, quote, onQuoteChange]);

  // Sincroniza variant fantasma no cart Shopify
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

  // UI: frete grátis
  if (isFree) {
    return (
      <div className="bg-[#1e3a1e]/5 border border-[#1e3a1e]/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Truck className="h-5 w-5 text-[#1e3a1e] mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-[#1e3a1e] font-sans">
              Entrega Jilo • Frete grátis
            </p>
            <p className="text-xs text-[#1e3a1e]/80 font-sans mt-1">
              Para 7 ou mais marmitas, a entrega é por nossa conta. Em até 48h.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // UI: frete pago via Uber Direct
  return (
    <div className="bg-white border border-[#e8e8e4] rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Truck className="h-5 w-5 text-[#1a1a1a] mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold text-[#1a1a1a] font-sans">Entrega Uber Direct</p>

          {!cepParams && (
            <p className="text-xs text-[#9b9b9b] font-sans mt-1">
              Verifique seu CEP acima para calcular o frete.
            </p>
          )}

          {cepParams && loading && (
            <p className="text-xs text-[#9b9b9b] font-sans mt-1 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Calculando frete...
            </p>
          )}

          {cepParams && error && (
            <p className="text-xs text-red-600 font-sans mt-1">
              Não foi possível calcular o frete. Tente novamente em instantes.
            </p>
          )}

          {cepParams && quote && !loading && (
            <>
              <p className="text-xs text-[#1a1a1a] font-sans mt-1">
                <span className="font-bold">
                  R$ {(quote.fee_cents / 100).toFixed(2).replace(".", ",")}
                </span>
                <span className="text-[#9b9b9b]"> • Entrega em ~{quote.duration_minutes}min</span>
              </p>
              <p className="text-[11px] text-[#9b9b9b] font-sans mt-1.5 flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>
                  Frete grátis a partir de {SHIPPING_FREE_THRESHOLD} marmitas
                  {itemsRemaining > 0 ? ` (faltam ${itemsRemaining})` : ""}.
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
