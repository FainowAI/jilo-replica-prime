import { Info } from "lucide-react";
import { getKitQuantityGuidance, KIT_STEP } from "@/config/kitQuantity";

type Props = {
  /** total de marmitas no carrinho, já SEM a variant fantasma de frete */
  totalNonShippingItems: number;
  /** "card" (padrão, com fundo) ou "inline" (compacto) */
  variant?: "card" | "inline";
  className?: string;
};

/**
 * Aviso da regra R56 (venda em múltiplos de KIT_STEP a partir de KIT_STEP marmitas).
 * Renderiza SOMENTE quando a quantidade está inválida (>= KIT_STEP e não-múltiplo).
 * Em quantidade válida (avulso ou múltiplo exato) retorna null.
 */
export default function KitQuantityNotice({
  totalNonShippingItems,
  variant = "card",
  className = "",
}: Props) {
  const { valid, toAdd, toRemove, nextMultiple, prevMultiple } =
    getKitQuantityGuidance(totalNonShippingItems);

  if (valid) return null;

  const base =
    variant === "card"
      ? "rounded-xl border border-[#d4a017]/40 bg-[#d4a017]/10 p-4"
      : "rounded-lg bg-[#d4a017]/10 px-3 py-2";

  return (
    <div className={`${base} ${className}`} role="status">
      <div className="flex gap-2.5">
        <Info className="h-4 w-4 text-[#b8891a] flex-shrink-0 mt-0.5" />
        <div className="font-sans">
          <p className="text-[13px] font-bold text-[#1a1a1a] mb-1">
            Pedidos a partir de {KIT_STEP} saem em kits
          </p>
          <p className="text-[12px] text-[#6b6b6b] leading-[18px]">
            A Jiló tá começando e, por enquanto, os pedidos de {KIT_STEP} marmitas
            pra cima saem em kits fechados de {KIT_STEP} — assim o frete fecha a
            conta e chega tudo certinho. Falta{" "}
            <span className="font-semibold text-[#1a1a1a]">{toAdd}</span> pra
            completar o kit de{" "}
            <span className="font-semibold text-[#1a1a1a]">{nextMultiple}</span>,
            ou tira{" "}
            <span className="font-semibold text-[#1a1a1a]">{toRemove}</span> pra
            voltar pro kit de{" "}
            <span className="font-semibold text-[#1a1a1a]">{prevMultiple}</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
