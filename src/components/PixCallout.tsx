interface PixCalloutProps {
  originalCents?: number;
  className?: string;
  variant?: "inline" | "card";
}

const PixCallout = ({ originalCents, className = "", variant = "inline" }: PixCalloutProps) => {
  const pixValue = originalCents ? (originalCents * 0.95 / 100) : null;

  if (variant === "card") {
    return (
      <div className={`bg-[#32bcad]/10 border border-[#32bcad]/20 rounded-xl p-3 ${className}`}>
        <p className="text-[13px] font-sans text-[#1a1a1a]">
          <span className="font-bold text-[#32bcad]">PIX com 5% off</span>
          {pixValue && (
            <span className="ml-1">
              → R$ {pixValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          )}
        </p>
        <p className="text-[11px] text-[#9b9b9b] font-sans mt-0.5">
          Use o código <span className="font-bold">PIX5</span> no checkout para aplicar
        </p>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[12px] font-sans font-semibold text-[#32bcad] ${className}`}>
      PIX 5% off
      {pixValue && (
        <span className="text-[#1a1a1a] font-normal">
          R$ {pixValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </span>
      )}
    </span>
  );
};

export default PixCallout;
