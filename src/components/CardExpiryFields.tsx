import { useId, useRef, useState, type Ref } from "react";
import { PopoverAnchor } from "@radix-ui/react-popover";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { onlyDigits } from "@/lib/vr/card";

const inputCls =
  "w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]";
const labelCls = "text-xs font-semibold text-[#6b6b6b] font-sans block mb-1";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_OPTIONS = MESES.map((nome, i) => {
  const mm = String(i + 1).padStart(2, "0");
  return { value: mm, label: `${mm} ${nome}` };
});

interface ExpiryBoxProps {
  id: string;
  label: string;
  triggerLabel: string;
  value: string;
  onChange: (raw: string) => void;
  maxLength: number;
  placeholder: string;
  autoComplete: string;
  inputRef?: Ref<HTMLInputElement>;
  options: { value: string; label: string }[];
  isSelected: (optionValue: string) => boolean;
  onPick: (optionValue: string) => void;
  columnsCls: string;
}

// Um "quadrado": input digitável + botão que abre a lista suspensa (Popover do shadcn).
const ExpiryBox = ({
  id,
  label,
  triggerLabel,
  value,
  onChange,
  maxLength,
  placeholder,
  autoComplete,
  inputRef,
  options,
  isSelected,
  onPick,
  columnsCls,
}: ExpiryBoxProps) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        {/* Âncora no quadrado inteiro: a lista abre alinhada ao input, não ao botão. */}
        <PopoverAnchor asChild>
          <div className="relative">
            <input
              id={id}
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete={autoComplete}
              placeholder={placeholder}
              maxLength={maxLength}
              required
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={`${inputCls} pr-8`}
            />
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={triggerLabel}
                className="absolute inset-y-0 right-0 w-8 flex items-center justify-center rounded-r-lg text-[#6b6b6b] hover:text-[#1e3a1e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1e3a1e]"
              >
                <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", open && "rotate-180")} />
              </button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        {/* O Popover vai por Portal para fora do DialogContent (que tem overflow-y-auto), então: z acima do
            diálogo, lista sem scroll interno (o dialog bloqueia scroll fora dele) e ph-no-capture próprio. */}
        <PopoverContent
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="ph-no-capture z-[60] w-auto p-2 rounded-xl border-[#e8e8e4] bg-[#faf7f2] shadow-lg font-sans duration-200 origin-[var(--radix-popover-content-transform-origin)]"
        >
          <div className={cn("grid gap-1", columnsCls)}>
            {options.map((o) => {
              const selected = isSelected(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    onPick(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "rounded-lg px-2 py-2 text-sm font-sans transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a1e] focus-visible:ring-offset-1 focus-visible:ring-offset-[#faf7f2]",
                    selected ? "bg-[#1e3a1e] text-white font-semibold" : "text-[#1a1a1a] hover:bg-[#1e3a1e]/10",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

interface CardExpiryFieldsProps {
  mes: string;
  ano: string;
  onMesChange: (mes: string) => void;
  onAnoChange: (ano: string) => void;
}

/**
 * Validade do cartão em dois quadrados (Mês | Ano), digitando ou escolhendo na lista suspensa.
 * Renderiza dois itens de grid; quem usa monta o "MM/AAAA" do SOP com composeExpiry (@/lib/alelo/expiry).
 * Mês/ano não são PAN/CVV, mas continuam fora de log/analytics.
 */
const CardExpiryFields = ({ mes, ano, onMesChange, onAnoChange }: CardExpiryFieldsProps) => {
  const baseId = useId();
  const anoRef = useRef<HTMLInputElement>(null);
  const anoAtual = new Date().getFullYear();
  const anoOptions = Array.from({ length: 16 }, (_, i) => {
    const y = String(anoAtual + i);
    return { value: y, label: y };
  });
  // Ano de 2 dígitos vale 20XX (mesma regra do composeExpiry).
  const anoCompleto = ano.length === 2 ? 2000 + Number(ano) : Number(ano);

  const handleMes = (raw: string) => {
    const v = onlyDigits(raw).slice(0, 2);
    onMesChange(v);
    // Mês completo e válido: segue para o Ano.
    if (v.length === 2 && Number(v) >= 1 && Number(v) <= 12) anoRef.current?.focus();
  };

  return (
    <>
      <ExpiryBox
        id={`${baseId}-mes`}
        label="Mês"
        triggerLabel="Escolher mês"
        value={mes}
        onChange={handleMes}
        maxLength={2}
        placeholder="MM"
        autoComplete="cc-exp-month"
        options={MESES_OPTIONS}
        isSelected={(v) => Number(mes) === Number(v)}
        onPick={onMesChange}
        columnsCls="grid-cols-3"
      />
      <ExpiryBox
        id={`${baseId}-ano`}
        label="Ano"
        triggerLabel="Escolher ano"
        value={ano}
        onChange={(raw) => onAnoChange(onlyDigits(raw).slice(0, 4))}
        maxLength={4}
        placeholder="AAAA"
        autoComplete="cc-exp-year"
        inputRef={anoRef}
        options={anoOptions}
        isSelected={(v) => anoCompleto === Number(v)}
        onPick={onAnoChange}
        columnsCls="grid-cols-4"
      />
    </>
  );
};

export default CardExpiryFields;
