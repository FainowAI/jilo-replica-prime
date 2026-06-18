import { useEffect, useRef, useState, useMemo } from "react";
import { Truck, Loader2, Info, Check } from "lucide-react";
import {
  SHIPPING_FREE_THRESHOLD,
  SHIPPING_VARIANT_ID,
  DELIVERY_PROMISE_LABEL,
  LALAMOVE_FIXED_FEE_CENTS,
  LALAMOVE_METHOD_LABEL,
  isFreeShipping,
} from "@/config/shipping";
import { useShippingQuote } from "@/hooks/useShippingQuote";
import { updateShippingVariantPrice, UberQuoteError } from "@/lib/uberDirect";
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
  const [didCleanupOnMount, setDidCleanupOnMount] = useState(false);
  // Item 5: o cliente optou pela Entrega Lalamove no fallback "SJC + <7 + fora do raio Uber".
  const [lalamoveSelected, setLalamoveSelected] = useState(false);
  const cancelCountRef = useRef(0);
  const lastDepsSnapshotRef = useRef<{
    isFree: boolean | null;
    quoteFeeCents: number | null;
    cepHash: string | null;
    lalamoveSelected: boolean | null;
  }>({ isFree: null, quoteFeeCents: null, cepHash: null, lalamoveSelected: null });

  // Memoiza cepParams com base em chaves primitivas do deliveryCheck. Sem isso,
  // um novo objeto seria criado a cada render do componente, vazando para a
  // dep array do useEffect de sincronização e cancelando o setTimeout(sync, 300)
  // antes do sync() completar. Isso é o que causou a regressão da Sprint 4.5
  // onde a variant fantasma nunca entrava no cart (TOTAL = subtotal sem frete).
  const cepParams = useMemo(() => {
    if (!deliveryCheck?.isDeliverable || !deliveryCheck.cepInfo) return null;
    return {
      dropoff_cep: deliveryCheck.cepInfo.cep,
      dropoff_address: deliveryCheck.cepInfo.logradouro || "Endereço",
      dropoff_city: deliveryCheck.cepInfo.localidade,
      dropoff_state: deliveryCheck.cepInfo.uf,
    };
  }, [
    deliveryCheck?.isDeliverable,
    deliveryCheck?.cepInfo?.cep,
    deliveryCheck?.cepInfo?.logradouro,
    deliveryCheck?.cepInfo?.localidade,
    deliveryCheck?.cepInfo?.uf,
  ]);

  const { quote, loading, error } = useShippingQuote(totalNonShippingItems, cepParams);

  // Distingue os dois cenários de "não dá pra Uber":
  // - deliveryCheck.isDeliverable === false  → cidade fora de SJC (sem fallback, só bloqueio)
  // - isDeliverable === true + UberQuoteError address_undeliverable → SJC fora do raio Uber
  //   (oferecemos o fallback Lalamove com frete fixo).
  const isUberUndeliverable =
    error instanceof UberQuoteError && error.code === "address_undeliverable";
  const addressDeliverable = deliveryCheck?.isDeliverable === true;
  // Lalamove só vale enquanto o cenário for "SJC + <7 + fora do raio Uber" E o cliente optar.
  const wantsLalamove =
    lalamoveSelected && isUberUndeliverable && addressDeliverable && !isFree && !!cepParams;

  // Reseta a opção Lalamove quando o cenário muda: (a) cruza pra frete grátis,
  // (b) endereço deixa de ser entregável, (c) a cotação Uber volta a funcionar (existe quote).
  useEffect(() => {
    if (isFree || !addressDeliverable || quote) {
      setLalamoveSelected(false);
    }
  }, [isFree, addressDeliverable, quote]);

  // Reporta o quote ativo para o Carrinho (usa nos cart attributes e no canCheckout).
  // Quando endereço não é entregável ou sem cotação, reporta (null, 0) para garantir
  // que o canCheckout do Carrinho rejeite o avanço.
  useEffect(() => {
    if (!onQuoteChange) return;
    const addressNotDeliverable = deliveryCheck != null && !deliveryCheck.isDeliverable;

    if (addressNotDeliverable) {
      onQuoteChange(null, 0);
      return;
    }
    if (isFree) {
      onQuoteChange(null, 0);
      return;
    }
    if (quote) {
      onQuoteChange(quote.quote_id, quote.fee_cents);
      return;
    }
    // Fallback Lalamove: não há quote Uber, reporta um sentinela "lalamove" + frete fixo.
    // O hard-block R59 (freightStateOk) segue protegendo: só libera quando a variant
    // fantasma de fato entrar no Shopify Cart.
    if (wantsLalamove) {
      onQuoteChange("lalamove", LALAMOVE_FIXED_FEE_CENTS);
      return;
    }
    // sem cotação ainda (loading/error) — zera para evitar checkout antes da cotação chegar
    onQuoteChange(null, 0);
  }, [isFree, quote, deliveryCheck, wantsLalamove, onQuoteChange]);

  // Cleanup defensivo no mount: se o cart hidratado do localStorage contém
  // variant fantasma com quantity > 1 (estado bugado de sessão anterior, R50),
  // remove ela aqui antes do effect de sincronização rodar. Isso protege
  // clientes que estavam em produção quando o bug existia.
  useEffect(() => {
    if (didCleanupOnMount) return;
    if (!SHIPPING_VARIANT_ID) {
      setDidCleanupOnMount(true);
      return;
    }

    const items = useCartStore.getState().items;
    const shippingItems = items.filter((i) => i.variantId === SHIPPING_VARIANT_ID);
    const hasStaleShipping = shippingItems.some((i) => i.quantity > 1);

    if (hasStaleShipping) {
      console.warn(
        "[ShippingMethodSelector] Detectada variant fantasma stale no localStorage " +
        "(quantity > 1). Removendo antes de re-sincronizar."
      );
      // Fire-and-forget — o effect de sync abaixo vai re-adicionar se necessário
      removeItem(SHIPPING_VARIANT_ID).catch((err) => {
        console.error("[ShippingMethodSelector] Cleanup defensivo falhou:", err);
      });
      lastSyncedFeeRef.current = null;
    }
    setDidCleanupOnMount(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [didCleanupOnMount]);

  // Sincroniza variant fantasma no cart Shopify
  useEffect(() => {
    if (!SHIPPING_VARIANT_ID) return;

    // ── Diagnóstico defensivo: detecta regressão de memoização ─────────────
    // Snapshot das deps no formato comparável (cepHash pra não vazar objeto).
    const cepHash = cepParams
      ? `${cepParams.dropoff_cep}|${cepParams.dropoff_city}|${cepParams.dropoff_state}`
      : null;
    const prev = lastDepsSnapshotRef.current;
    const depsChanged =
      prev.isFree !== isFree ||
      prev.quoteFeeCents !== (quote?.fee_cents ?? null) ||
      prev.cepHash !== cepHash ||
      prev.lalamoveSelected !== lalamoveSelected;
    if (!depsChanged && import.meta.env.DEV) {
      console.warn(
        "[ShippingMethodSelector] useEffect re-rodou sem mudança de deps primitivas. " +
        "Provável regressão de memoização (objeto literal nas deps). Investigar.",
        { isFree, quoteFeeCents: quote?.fee_cents, cepHash, lalamoveSelected }
      );
    }
    lastDepsSnapshotRef.current = {
      isFree,
      quoteFeeCents: quote?.fee_cents ?? null,
      cepHash,
      lalamoveSelected,
    };
    // ────────────────────────────────────────────────────────────────────────

    // Lê snapshot do store de forma imperativa — NÃO depender de `items` no array
    // de deps, senão o effect roda sempre que qualquer item do cart muda (loop com
    // addItem/removeItem que ele próprio chama).
    const currentItems = useCartStore.getState().items;
    const shippingItem = currentItems.find((i) => i.variantId === SHIPPING_VARIANT_ID);

    // Caso 1: frete grátis OU endereço não-entregável OU sem CEP — remover se existir.
    // R41: variant fantasma só entra no cart se área é entregável e cotação válida.
    // Item 5: também remove no cenário fora-do-raio Uber quando o cliente NÃO escolheu
    // Lalamove (beco sem saída, checkout bloqueado como antes). O caminho positivo do
    // Lalamove (wantsLalamove) NÃO cai aqui: addressNotDeliverable é false (CEP está em SJC)
    // e cepParams existe, então sincroniza com preço fixo logo abaixo.
    const addressNotDeliverable = deliveryCheck != null && !deliveryCheck.isDeliverable;
    const undeliverableNoLalamove = isUberUndeliverable && !lalamoveSelected;
    if (isFree || addressNotDeliverable || !cepParams || undeliverableNoLalamove) {
      if (shippingItem) {
        lastSyncedFeeRef.current = null;
        (async () => {
          try {
            await removeItem(SHIPPING_VARIANT_ID);
            // Verifica no snapshot fresh do store se a linha realmente saiu.
            const stillThere = useCartStore
              .getState()
              .items.some((i) => i.variantId === SHIPPING_VARIANT_ID);
            if (stillThere) {
              console.warn(
                "[ShippingMethodSelector] Variant fantasma ainda presente após remoção " +
                  "em frete grátis — retry."
              );
              await removeItem(SHIPPING_VARIANT_ID);
              const stillThereAfterRetry = useCartStore
                .getState()
                .items.some((i) => i.variantId === SHIPPING_VARIANT_ID);
              if (stillThereAfterRetry) {
                console.error(
                  "[ShippingMethodSelector] CRÍTICO: não foi possível remover a variant " +
                    "fantasma num carrinho de frete grátis. O hard-block do Carrinho segue " +
                    "protegendo contra cobrança de frete indevida."
                );
              }
            }
          } catch (err) {
            console.error(
              "[ShippingMethodSelector] Falha ao remover variant fantasma em frete grátis:",
              err
            );
          }
        })();
      }
      return;
    }

    // Determina a fee a sincronizar:
    // - Fallback Lalamove selecionado → preço FIXO (não há quote Uber).
    // - Caso padrão → fee da cotação Uber (se já chegou).
    let feeToSync: number | null = null;
    if (wantsLalamove) {
      feeToSync = LALAMOVE_FIXED_FEE_CENTS;
    } else if (quote) {
      feeToSync = quote.fee_cents;
    } else {
      // Caso 2: cotação ainda não chegou — não fazer nada
      return;
    }

    // Caso 3: fee igual à última sincronizada E variant fantasma única e correta — nada a fazer
    if (
      lastSyncedFeeRef.current === feeToSync &&
      shippingItem &&
      shippingItem.quantity === 1
    ) {
      return;
    }

    // Caso 4: precisa sincronizar — atualiza preço, depois REPLACE atômico via addItem (R50)
    let syncStarted = false;
    const sync = async () => {
      syncStarted = true;
      try {
        await updateShippingVariantPrice(feeToSync);

        // addItem detecta isShippingVariant(variantId) e decide:
        // - primeira inserção → cria linha nova
        // - re-inserção → REPLACE atômico (remove + add quantity=1)
        // Garantia singleton vive no store (R50). A variant fantasma é a MESMA SKU
        // do Uber — no Lalamove só muda o preço (fixo), nunca um segundo SKU de frete.
        await addItem({
          product: buildShippingVariantProduct(feeToSync),
          variantId: SHIPPING_VARIANT_ID,
          variantTitle: "Default",
          price: { amount: (feeToSync / 100).toFixed(2), currencyCode: "BRL" },
          quantity: 1,
          selectedOptions: [],
        });

        lastSyncedFeeRef.current = feeToSync;
        // Sync completou — zera contador de cancellations
        cancelCountRef.current = 0;
      } catch (err) {
        console.error("[ShippingMethodSelector] failed to sync shipping variant:", err);
      }
    };

    // Debounce 300ms para evitar race com Shopify Cart API quando cliente muda quantidades rápido
    const timer = setTimeout(sync, 300);
    return () => {
      clearTimeout(timer);
      // ── Diagnóstico defensivo: timer cancelado antes do sync iniciar ─────
      // Se o sync já tinha iniciado, não conta como cancellation. Se foi cancelado
      // antes mesmo de o setTimeout disparar, conta.
      if (!syncStarted) {
        cancelCountRef.current += 1;
        if (cancelCountRef.current >= 5) {
          console.warn(
            "[ShippingMethodSelector] Effect re-render loop detectado: " +
            `${cancelCountRef.current} cancellations consecutivas sem sync completar. ` +
            "Variant fantasma pode não estar entrando no cart. " +
            "Possível regressão de memoização — investigar deps do useEffect."
          );
        }
      }
      // ──────────────────────────────────────────────────────────────────────
    };
    // PROPOSITAL: `items` NÃO está nas deps — usamos getState() para snapshot fresh
    // sem encadear loop. O effect re-roda quando isFree, quote, cepParams ou o estado
    // do fallback Lalamove (wantsLalamove/lalamoveSelected/isUberUndeliverable) mudam.
  }, [
    isFree,
    quote,
    cepParams,
    deliveryCheck,
    wantsLalamove,
    lalamoveSelected,
    isUberUndeliverable,
    addItem,
    removeItem,
  ]);

  // UI: endereço selecionado mas fora da cobertura (não está em SJC)
  if (deliveryCheck != null && !deliveryCheck.isDeliverable) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-700 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900 font-sans">
              Não entregamos para este endereço
            </p>
            <p className="text-xs text-amber-800 font-sans mt-1">
              No momento atendemos apenas <strong>São José dos Campos</strong>.
              Escolha um endereço em SJC ou cadastre um novo.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
            error instanceof UberQuoteError && error.code === "address_undeliverable" ? (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 font-sans">
                <p className="text-xs font-bold text-amber-900 mb-1">
                  Endereço fora do nosso raio Uber Direct
                </p>
                <p className="text-xs text-amber-800 mb-2">
                  Esse endereço está a mais de ~5km do nosso ponto de partida em São José
                  dos Campos. A Uber Direct não consegue entregar aqui.
                </p>

                {/* Fallback: Entrega Lalamove com frete fixo (despacho manual pela frota) */}
                <button
                  type="button"
                  onClick={() => setLalamoveSelected(true)}
                  className={`w-full text-left border rounded-xl p-3 transition-all bg-white ${
                    lalamoveSelected
                      ? "border-[#1e3a1e] ring-1 ring-[#1e3a1e]"
                      : "border-[#e8e8e4] hover:border-[#1e3a1e]/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Truck className="h-4 w-4 text-[#1a1a1a] flex-shrink-0" />
                      <span className="text-sm font-bold text-[#1a1a1a]">
                        {LALAMOVE_METHOD_LABEL} — R$ {(LALAMOVE_FIXED_FEE_CENTS / 100).toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                    {lalamoveSelected && (
                      <div className="w-5 h-5 rounded-full bg-[#1e3a1e] flex items-center justify-center flex-shrink-0">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-[#9b9b9b] mt-1 flex items-start gap-1">
                    <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>{DELIVERY_PROMISE_LABEL}, qualquer que seja o método.</span>
                  </p>
                  {/* TODO(PROMPT 3): adicionar a nota de dias úteis via DELIVERY_BUSINESS_DAYS_NOTE
                      quando a constante existir em @/config/shipping. */}
                </button>

                {itemsRemaining > 0 && (
                  <div className="mt-2 pt-2 border-t border-amber-200">
                    <p className="text-xs text-[#1e3a1e] font-semibold mb-1">
                      Ou adicione mais {itemsRemaining} marmita{itemsRemaining === 1 ? "" : "s"} pra ter frete grátis.
                    </p>
                    <p className="text-[11px] text-amber-800">
                      Com {SHIPPING_FREE_THRESHOLD}+ marmitas, a entrega é feita pela nossa frota.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-red-600 font-sans mt-1">
                Não foi possível calcular o frete. Tente novamente em instantes.
              </p>
            )
          )}

          {cepParams && quote && !loading && (
            <>
              <p className="text-xs text-[#1a1a1a] font-sans mt-1">
                <span className="font-bold">
                  R$ {(quote.fee_cents / 100).toFixed(2).replace(".", ",")}
                </span>
                <span className="text-[#9b9b9b]"> • Coleta Uber em ~{quote.duration_minutes}min</span>
              </p>
              <p className="text-[11px] text-[#9b9b9b] font-sans mt-1.5 flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{DELIVERY_PROMISE_LABEL}, qualquer que seja o método.</span>
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
