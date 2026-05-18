PROMPT 4 — Refatorar <ShippingMethodSelector /> com 3 estados novos
Contexto
O componente atual tem 3 estados visuais: isFree, loading, error, quote. Faltam tratar:

Endereço selecionado mas fora de SJC (isDeliverable === false): mostra mensagem clara, sem chamar Uber.
Erro address_undeliverable da Uber (endereço em SJC mas fora do raio): mostra upsell pra 7+ marmitas + aviso de frete diferenciado via WhatsApp.
Outros erros da Uber: mantém mensagem genérica atual.

A regra adicional: quando o endereço não está em SJC, o componente NÃO deve sincronizar a variant fantasma no cart (limpa se houver) e NÃO deve chamar a Uber.
Tarefa
Edite src/components/ShippingMethodSelector.tsx aplicando as mudanças abaixo.
Mudança 1 — Atualizar imports no topo
Substituir o import:
tsimport { useShippingQuote } from "@/hooks/useShippingQuote";
import { updateShippingVariantPrice } from "@/lib/uberDirect";
Por:
tsimport { useShippingQuote } from "@/hooks/useShippingQuote";
import { updateShippingVariantPrice, UberQuoteError } from "@/lib/uberDirect";
Mudança 2 — Bloquear cotação quando endereço não-entregável
Localizar o cálculo de cepParams:
tsconst cepParams = deliveryCheck?.isDeliverable && deliveryCheck.cepInfo
  ? {
      dropoff_cep: deliveryCheck.cepInfo.cep,
      dropoff_address: deliveryCheck.cepInfo.logradouro || "Endereço",
      dropoff_city: deliveryCheck.cepInfo.localidade,
      dropoff_state: deliveryCheck.cepInfo.uf,
    }
  : null;
Isto NÃO precisa mudar — cepParams já vira null se !isDeliverable, então o useShippingQuote não dispara. Apenas confirme que está intacto.
Mudança 3 — Garantir limpeza da variant fantasma quando endereço fica não-entregável
Localizar o useEffect de sincronização:
ts// Sincroniza variant fantasma no cart Shopify
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
  ...
Substituir o bloco // Caso 1: frete grátis — remover se existir por:
ts  // Caso 1: frete grátis OU endereço não-entregável OU sem CEP — remover se existir.
  // R41: variant fantasma só entra no cart se área é entregável e cotação válida.
  const addressNotDeliverable = deliveryCheck != null && !deliveryCheck.isDeliverable;
  if (isFree || addressNotDeliverable || !cepParams) {
    if (shippingItem) {
      removeItem(SHIPPING_VARIANT_ID);
      lastSyncedFeeRef.current = null;
    }
    return;
  }
E remover o bloco redundante que vinha depois:
ts  // Caso 2: cotação ainda não chegou ou CEP não validado — não fazer nada
  if (!quote || !cepParams) return;
Substituir por:
ts  // Caso 2: cotação ainda não chegou — não fazer nada
  if (!quote) return;
Atualizar as dependências do useEffect para incluir deliveryCheck:
ts}, [isFree, quote, cepParams, addItem, removeItem]);
Substituir por:
ts}, [isFree, quote, cepParams, deliveryCheck, addItem, removeItem]);
Mudança 4 — Reportar onQuoteChange(null, 0) quando não-entregável
Localizar o useEffect de reporte para o Carrinho:
ts// Reporta o quote ativo para o Carrinho (que vai usar nos cart attributes)
useEffect(() => {
  if (!onQuoteChange) return;
  if (isFree) onQuoteChange(null, 0);
  else if (quote) onQuoteChange(quote.quote_id, quote.fee_cents);
}, [isFree, quote, onQuoteChange]);
Substituir por:
ts// Reporta o quote ativo para o Carrinho (usa nos cart attributes e no canCheckout).
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
  // sem cotação ainda (loading/error) — zera para evitar checkout antes da cotação chegar
  onQuoteChange(null, 0);
}, [isFree, quote, deliveryCheck, onQuoteChange]);
Mudança 5 — Adicionar UI específica para endereço não-entregável
Localizar o bloco de UI "frete grátis":
tsx// UI: frete grátis
if (isFree) {
  return (
    <div className="bg-[#1e3a1e]/5 border border-[#1e3a1e]/20 rounded-xl p-4">
      ...
    </div>
  );
}
Adicionar, logo antes desse bloco if (isFree), um novo bloco:
tsx// UI: endereço selecionado mas fora da cobertura (não está em SJC)
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
Mudança 6 — Atualizar tratamento de erro para detectar address_undeliverable
Localizar o bloco de erro genérico dentro do JSX final:
tsx{cepParams && error && (
  <p className="text-xs text-red-600 font-sans mt-1">
    Não foi possível calcular o frete. Tente novamente em instantes.
  </p>
)}
Substituir por:
tsx{cepParams && error && (
  error instanceof UberQuoteError && error.code === "address_undeliverable" ? (
    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 font-sans">
      <p className="text-xs font-bold text-amber-900 mb-1">
        Endereço fora do nosso raio Uber Direct
      </p>
      <p className="text-xs text-amber-800 mb-2">
        Esse endereço está a mais de ~5km do nosso ponto de partida em São José
        dos Campos. A Uber Direct não consegue entregar aqui.
      </p>
      {itemsRemaining > 0 && (
        <div className="mt-2 pt-2 border-t border-amber-200">
          <p className="text-xs text-[#1e3a1e] font-semibold mb-1">
            Sugestão: adicione mais {itemsRemaining} marmita{itemsRemaining === 1 ? "" : "s"} ao pedido.
          </p>
          <p className="text-[11px] text-amber-800">
            Com {SHIPPING_FREE_THRESHOLD}+ marmitas, a entrega é feita pela nossa frota.
            <strong> Atenção:</strong> como este endereço fica fora do nosso raio padrão,
            o frete será calculado à parte e confirmado via WhatsApp.
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
Referências

A regra de bloquear cart ≥ 7 fora de SJC já é garantida pelo Mudança 5 acima — quando deliveryCheck.isDeliverable === false, retorna UI específica antes mesmo de checar isFree. Logo, mesmo cart ≥ 7 fora de SJC mostra "Não entregamos para este endereço".
A constante itemsRemaining já existe no componente: const itemsRemaining = SHIPPING_FREE_THRESHOLD - totalNonShippingItems;.
A constante SHIPPING_FREE_THRESHOLD já está importada de @/config/shipping.

IMPORTANTE — Não quebre o que já funciona

NÃO altere a função buildShippingVariantProduct — formato da variant fantasma intacto.
NÃO altere a interface ShippingMethodSelectorProps — Carrinho.tsx depende.
NÃO altere o debounce de 300ms na sincronização da variant — race condition já mitigada (gotcha conhecido).
NÃO altere o bloco UI de isFree — segue intacto, agora só renderiza quando endereço é entregável.
NÃO altere o bloco UI de quote quando cotação chegou com sucesso — segue intacto.