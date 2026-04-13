const BenefitsSummary = ({ className = "" }: { className?: string }) => {
  const benefits = [
    "Desconto de kit aplicado automaticamente",
    "Frete grátis — entrega em até 48h (cortesia Jilo)",
    "5% adicional pagando com PIX",
  ];
  return (
    <div className={`bg-[#f5f3ee] border border-[#e8e8e4] rounded-xl p-4 space-y-2 ${className}`}>
      {benefits.map((b) => (
        <p key={b} className="flex items-start gap-2 text-[13px] text-[#1e3a1e] font-sans">
          <span className="text-[#d4a017] font-bold mt-0.5">✓</span>
          {b}
        </p>
      ))}
    </div>
  );
};

export default BenefitsSummary;
