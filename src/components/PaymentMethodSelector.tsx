import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/stores/cartStore";
import { getPixCouponForCart, isPixCoupon } from "@/config/pixCoupons";

export type PaymentMethod = "pix" | "credit" | "paypal";

interface PaymentMethodSelectorProps {
  className?: string;
  subtotalCents: number;
  totalNonShippingItems: number; // fonte: useNonShippingTotalItems()
  onMethodChange?: (method: PaymentMethod) => void;
}

const PaymentMethodSelector = ({
  className = "",
  subtotalCents,
  totalNonShippingItems,
  onMethodChange,
}: PaymentMethodSelectorProps) => {
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const [applying, setApplying] = useState(false);
  const { discountCodes, applyDiscountCode, removeDiscountCode } = useCartStore();

  const activePix = getPixCouponForCart(totalNonShippingItems);
  // Arredonda em centavos para que (final + economia) feche exatamente com a base.
  const pixDiscountCents = subtotalCents
    ? Math.round((subtotalCents * activePix.percent) / 100)
    : 0;
  const pixFinalCents = subtotalCents ? subtotalCents - pixDiscountCents : 0;
  const pixDiscount = pixDiscountCents / 100;
  const pixFinalValue = pixFinalCents / 100;

  const hasOtherCoupon = discountCodes.some(
    (dc) => dc.applicable && !isPixCoupon(dc.code)
  );

  // R61: o cupom PIX é sempre PIX5 (5%), independente da quantidade. Não há mais
  // troca PIX5 ↔ PIX3 ao cruzar threshold, então o antigo useEffect de re-aplicação
  // por mudança de volume foi removido — a aplicação do cupom acontece em handleSelect
  // quando o usuário seleciona PIX.

  const handleSelect = async (method: PaymentMethod) => {
    if (selected === method || applying) return;

    if (method === "pix" && hasOtherCoupon) {
      const otherCode = discountCodes.find(
        (dc) => dc.applicable && !isPixCoupon(dc.code)
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
          // Esperado apenas se o Shopify Admin estiver desconfigurado.
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
  };

  const PAYMENT_METHODS: Array<{
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

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-[11px] text-[#9b9b9b] uppercase tracking-wider font-sans font-semibold">
        Como você quer pagar?
      </p>
      <div className="space-y-2">
        {PAYMENT_METHODS.map((method) => {
          const isSelected = selected === method.id;
          const isDisabled = applying && !isSelected;
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => handleSelect(method.id)}
              disabled={isDisabled}
              className={`w-full text-left border rounded-xl p-3 transition-all font-sans ${
                isSelected
                  ? "border-[#1e3a1e] bg-[#1e3a1e]/5 ring-1 ring-[#1e3a1e]"
                  : "border-[#e8e8e4] bg-white hover:border-[#1e3a1e]/40"
              } ${isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-[#1a1a1a]">{method.label}</span>
                  {method.badge && (
                    <span className="px-2 py-0.5 bg-[#32bcad] text-white text-[10px] font-bold rounded-full">
                      {method.badge}
                    </span>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {applying && isSelected ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#1e3a1e]" />
                  ) : isSelected ? (
                    <div className="w-5 h-5 rounded-full bg-[#1e3a1e] flex items-center justify-center">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-[#e8e8e4]" />
                  )}
                </div>
              </div>
              <p className="text-[11px] text-[#9b9b9b] mt-0.5">{method.description}</p>
              {method.id === "pix" && isSelected && pixFinalValue > 0 && (
                <p className="text-[12px] text-[#1e3a1e] font-semibold mt-1">
                  Total com PIX: R$ {pixFinalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  <span className="text-[#9b9b9b] font-normal">
                    ({activePix.percent}% off — economia de R$ {pixDiscount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </span>
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PaymentMethodSelector;
