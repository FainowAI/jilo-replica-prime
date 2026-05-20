PROMPT 1 — Refatorar PaymentMethodSelector para cupom PIX condicional
Contexto
O componente src/components/PaymentMethodSelector.tsx hoje aplica PIX5 cego, sem consultar a quantidade do carrinho. Precisamos torná-lo ciente do threshold de 7 marmitas (constante já existente SHIPPING_FREE_THRESHOLD em src/config/shipping.ts) e escolher o cupom dinamicamente: PIX5 se carrinho <7, PIX3 se ≥7.
Além disso, precisa:

Atualizar o badge "5% off" para refletir o desconto real (3% ou 5%)
Atualizar o cálculo de pixDiscount e pixFinalValue
Reagir a mudanças de quantidade enquanto PIX está selecionado (trocar o cupom automaticamente)
Logar diagnóstico em caso de applicable=false inesperado

Tarefa
Editar apenas src/components/PaymentMethodSelector.tsx. Aplicar as alterações abaixo preservando o resto do arquivo:
1.1 — Substituir a constante única por um par de constantes e helpers:
Trocar a linha:
tsconst PIX_COUPON_CODE = "PIX5";
Por:
ts// Cupons PIX condicionais à quantidade do carrinho.
// Política Jilo: <7 marmitas → PIX5 (5%) | ≥7 marmitas → PIX3 (3%, combinável com Kit X% automático).
// PIX5 é NÃO combinável no Shopify Admin; aplicá-lo com ≥7 marmitas falha com applicable=false.
// Manter sincronizado com a config do Shopify Admin → Discounts.
const PIX_COUPON_HIGH_VOLUME = "PIX3";  // ≥ SHIPPING_FREE_THRESHOLD
const PIX_COUPON_LOW_VOLUME = "PIX5";   // < SHIPPING_FREE_THRESHOLD
const PIX_COUPON_CODES = new Set([PIX_COUPON_HIGH_VOLUME, PIX_COUPON_LOW_VOLUME]);

function getPixCouponForCart(totalNonShippingItems: number): {
  code: string;
  percent: number;
} {
  if (totalNonShippingItems >= SHIPPING_FREE_THRESHOLD) {
    return { code: PIX_COUPON_HIGH_VOLUME, percent: 3 };
  }
  return { code: PIX_COUPON_LOW_VOLUME, percent: 5 };
}
1.2 — Adicionar import no topo do arquivo:
tsimport { useEffect, useRef, useState } from "react";  // adicionar useEffect e useRef
import { SHIPPING_FREE_THRESHOLD } from "@/config/shipping";
(Manter os imports existentes intactos — apenas estender React imports e adicionar o de shipping.)
1.3 — Adicionar nova prop totalNonShippingItems na interface:
tsinterface PaymentMethodSelectorProps {
  className?: string;
  subtotalCents: number;
  totalNonShippingItems: number;  // NOVO — fonte: useNonShippingTotalItems()
  onMethodChange?: (method: PaymentMethod) => void;
}
E destruturar no componente:
tsconst PaymentMethodSelector = ({
  className = "",
  subtotalCents,
  totalNonShippingItems,
  onMethodChange,
}: PaymentMethodSelectorProps) => {
1.4 — Substituir o cálculo de pixDiscount/pixFinalValue pela versão condicional:
Trocar:
tsconst pixDiscount = subtotalCents ? (subtotalCents * 0.05) / 100 : 0;
const pixFinalValue = subtotalCents ? (subtotalCents * 0.95) / 100 : 0;
Por:
tsconst activePix = getPixCouponForCart(totalNonShippingItems);
const pixDiscount = subtotalCents
  ? (subtotalCents * activePix.percent) / 100 / 100
  : 0;
const pixFinalValue = subtotalCents
  ? (subtotalCents * (100 - activePix.percent)) / 100 / 100
  : 0;
1.5 — Atualizar hasOtherCoupon para reconhecer ambos os cupons PIX:
Trocar:
tsconst hasOtherCoupon = discountCodes.some(
  (dc) => dc.applicable && dc.code.toUpperCase() !== PIX_COUPON_CODE
);
Por:
tsconst hasOtherCoupon = discountCodes.some(
  (dc) => dc.applicable && !PIX_COUPON_CODES.has(dc.code.toUpperCase())
);
1.6 — Atualizar handleSelect (PIX branch) para usar o cupom dinâmico e logar diagnóstico:
Substituir o bloco que começa com if (method === "pix" && hasOtherCoupon) { até o final de try { ... } por:
ts    if (method === "pix" && hasOtherCoupon) {
      const otherCode = discountCodes.find(
        (dc) => dc.applicable && !PIX_COUPON_CODES.has(dc.code.toUpperCase())
      )?.code;
      const confirmed = window.confirm(
        `Você tem o cupom ${otherCode} aplicado. Selecionar PIX vai substituí-lo pelo desconto PIX. Deseja continuar?`
      );
      if (!confirmed) return;
    }

    setApplying(true);
    try {
      if (method === "pix") {
        const couponToApply = activePix.code;
        const result = await applyDiscountCode(couponToApply);
        if (result.success && result.applicable) {
          setSelected("pix");
          toast.success(`PIX selecionado — ${activePix.percent}% de desconto aplicado!`);
        } else {
          // Diagnóstico: applicable=false em cenário inesperado.
          // Esperado apenas se Shopify Admin estiver desconfigurado.
          console.error("[PaymentMethodSelector] PIX coupon não aplicável", {
            attemptedCode: couponToApply,
            totalNonShippingItems,
            currentDiscountCodes: discountCodes,
            shopifyResult: result,
          });
          toast.error("Não foi possível aplicar o desconto PIX. Tente novamente.");
          return;
        }
      } else {
        if (selected === "pix") {
          await removeDiscountCode();
        }
        setSelected(method);
      }
      onMethodChange?.(method);
    } finally {
      setApplying(false);
    }
1.7 — Adicionar useEffect de reação à mudança de threshold:
Adicionar logo após a desestruturação do useCartStore, antes do handleSelect:
ts  // Quando cliente está com PIX selecionado e cruza o threshold de 7 marmitas
  // (subindo ou descendo), o cupom PIX vigente muda (PIX5 ↔ PIX3).
  // Aqui detectamos a mudança e trocamos o cupom no Shopify Cart automaticamente,
  // preservando o estado "PIX selecionado" do usuário.
  const lastSyncedCouponRef = useRef<string | null>(null);

  useEffect(() => {
    if (selected !== "pix") {
      lastSyncedCouponRef.current = null;
      return;
    }

    const expectedCoupon = activePix.code;
    const currentApplied = discountCodes.find((dc) =>
      PIX_COUPON_CODES.has(dc.code.toUpperCase())
    );

    // Se já temos o cupom certo aplicado e marcado como applicable, nada a fazer.
    if (
      currentApplied?.code.toUpperCase() === expectedCoupon &&
      currentApplied.applicable
    ) {
      lastSyncedCouponRef.current = expectedCoupon;
      return;
    }

    // Evita reentrada quando já estamos no meio de aplicar este cupom.
    if (lastSyncedCouponRef.current === expectedCoupon) return;

    lastSyncedCouponRef.current = expectedCoupon;

    (async () => {
      setApplying(true);
      try {
        const result = await applyDiscountCode(expectedCoupon);
        if (!result.success || !result.applicable) {
          console.error(
            "[PaymentMethodSelector] Re-aplicação de PIX falhou após mudança de threshold",
            {
              expectedCoupon,
              totalNonShippingItems,
              shopifyResult: result,
            }
          );
          // Reseta para "nenhum método selecionado" — UX prefere honesto a quebrado
          setSelected(null);
          toast.error(
            "Seu desconto PIX precisou ser recalculado mas falhou. Selecione novamente."
          );
        } else {
          toast.success(
            `Desconto PIX atualizado: ${activePix.percent}% off`
          );
        }
      } finally {
        setApplying(false);
      }
    })();
    // ESLint: queremos rodar quando totalNonShippingItems mudar.
    // discountCodes está incluído pq o `applicable` pode mudar fora do nosso fluxo.
  }, [activePix.code, activePix.percent, selected, discountCodes, applyDiscountCode, totalNonShippingItems]);
1.8 — Atualizar o badge dinâmico no PAYMENT_METHODS:
O array PAYMENT_METHODS está hoje no escopo do módulo (constante de cima). Mover para dentro do componente como useMemo ou simplesmente computar inline. Caminho mais limpo:
Remover a constante de módulo PAYMENT_METHODS. Substituir por uma função inline DENTRO do componente, ANTES do return:
ts  const PAYMENT_METHODS: Array<{
    id: PaymentMethod;
    label: string;
    badge?: string;
    description: string;
  }> = [
    {
      id: "pix",
      label: "PIX",
      badge: `${activePix.percent}% off`,
      description: "Desconto automático no total",
    },
    {
      id: "credit",
      label: "Cartão de Crédito",
      description: "Em até 3x sem juros",
    },
    {
      id: "paypal",
      label: "PayPal",
      description: "Pague com sua conta PayPal",
    },
  ];
(Isso faz com que o badge re-renderize automaticamente quando activePix.percent muda.)
1.9 — Atualizar texto do Total com PIX (no JSX, dentro do botão PIX selecionado):
Trocar:
tsx<p className="text-[12px] text-[#1e3a1e] font-semibold mt-1">
  Total com PIX: R$ {pixFinalValue.toLocaleString(...)}{" "}
  <span className="text-[#9b9b9b] font-normal">
    (economia de R$ {pixDiscount.toLocaleString(...)})
  </span>
</p>
Por (apenas adicionar {activePix.percent}% no texto da economia):
tsx<p className="text-[12px] text-[#1e3a1e] font-semibold mt-1">
  Total com PIX: R$ {pixFinalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}{" "}
  <span className="text-[#9b9b9b] font-normal">
    ({activePix.percent}% off — economia de R$ {pixDiscount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})
  </span>
</p>
Referências

src/config/shipping.ts — SHIPPING_FREE_THRESHOLD é a fonte única do threshold de 7
src/hooks/useNonShippingTotalItems.ts — hook que filtra a variant fantasma de frete; será a fonte do totalNonShippingItems que o Carrinho.tsx vai passar
src/stores/cartStore.ts — applyDiscountCode retorna { success, applicable }; applicable=false significa cupom rejeitado pelo Shopify
.claude/requirements.md regras R19 (PIX5 ativo), R34 (threshold de 7)
.claude/fluxo-carrinho-checkout.md regra 9 (lógica atual do seletor)

IMPORTANTE — Não quebre o que já funciona

NÃO alterar o PixCallout.tsx neste prompt. Ele continua mostrando "PIX 5% off" estaticamente em Product.tsx, CartDrawer.tsx, Kit.tsx e KitLivre.tsx. Isso é débito técnico assumido — vai pro state.md.
NÃO alterar cartStore.applyDiscountCode — o contrato dele já está correto para ambos os cupons
NÃO alterar cartStore.removeDiscountCode — removeDiscountCodesFromCart no Shopify zera todos os codes do cart, comportamento desejado
Manter o window.confirm quando há outro cupom manual ativo — UX validada
Manter o console.error com payload do cart sempre que applicable=false inesperado acontecer
O efeito de troca automática NÃO deve disparar se selected !== "pix" — sair cedo