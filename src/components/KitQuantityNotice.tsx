import { Info, Check, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  isValidKitQuantity,
  getKitQuantityGuidance,
  KIT_STEP,
} from "@/config/kitQuantity";

type Props = {
  /** total de marmitas no carrinho, SEM a variant fantasma de frete */
  totalNonShippingItems: number;
  variant?: "card" | "inline";
  className?: string;
  /** chamado antes de navegar (ex.: fechar o drawer). Se ausente, navega direto. */
  onNavigate?: () => void;
};

/**
 * Alerta da regra R56. Aparece a partir de KIT_STEP marmitas:
 * - múltiplo exato → tom positivo + botão "Adicionar mais KIT_STEP"
 * - inválido       → tom de atenção + botão "Adicionar mais {toAdd}" + texto "ou remova {toRemove}"
 * Abaixo de KIT_STEP (avulso) retorna null.
 * O botão de ação roteia pra /kit-livre (montador, já ilimitado).
 */
export default function KitQuantityNotice({
  totalNonShippingItems,
  variant = "card",
  className = "",
  onNavigate,
}: Props) {
  const navigate = useNavigate();

  // Abaixo do primeiro kit: avulso livre, nada a comunicar.
  if (totalNonShippingItems < KIT_STEP) return null;

  const valid = isValidKitQuantity(totalNonShippingItems);
  const { toAdd, toRemove, nextMultiple, prevMultiple } =
    getKitQuantityGuidance(totalNonShippingItems);

  const goToKitLivre = () => {
    onNavigate?.();
    navigate("/kit-livre");
  };

  const wrap =
    variant === "card"
      ? "rounded-xl border p-4"
      : "rounded-lg px-3 py-2.5 border";
  const tone = valid
    ? "border-[#1e3a1e]/25 bg-[#1e3a1e]/5"
    : "border-[#d4a017]/40 bg-[#d4a017]/10";

  return (
    <div className={`${wrap} ${tone} ${className}`} role="status">
      <div className="flex gap-2.5">
        {valid ? (
          <Check className="h-4 w-4 text-[#1e3a1e] flex-shrink-0 mt-0.5" />
        ) : (
          <Info className="h-4 w-4 text-[#b8891a] flex-shrink-0 mt-0.5" />
        )}
        <div className="font-sans min-w-0 flex-1">
          {valid ? (
            <>
              <p className="text-[13px] font-bold text-[#1e3a1e] mb-0.5">
                Kit de {totalNonShippingItems} fechado
              </p>
              <p className="text-[12px] text-[#6b6b6b] leading-[18px] mb-2.5">
                A partir de {KIT_STEP} a Jiló entrega em kits de {KIT_STEP}. Quer
                reforçar o estoque da semana? Adicione mais um kit.
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-bold text-[#1a1a1a] mb-0.5">
                Pedidos a partir de {KIT_STEP} saem em kits
              </p>
              <p className="text-[12px] text-[#6b6b6b] leading-[18px] mb-2.5">
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
            </>
          )}
          <button
            type="button"
            onClick={goToKitLivre}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#1e3a1e] text-white rounded-lg text-[12px] font-bold font-sans hover:bg-[#1e3a1e]/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {valid ? `Adicionar mais ${KIT_STEP}` : `Adicionar mais ${toAdd}`}
          </button>
        </div>
      </div>
    </div>
  );
}
