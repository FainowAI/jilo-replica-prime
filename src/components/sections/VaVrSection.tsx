const brands = ["Alelo", "Sodexo", "VR", "Ticket", "Flash"];

const VaVrSection = () => {
  return (
    <section className="py-16 lg:py-24 bg-[#1e3a1e]">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="flex flex-col items-start text-left">
            <span className="inline-flex bg-[rgba(212,160,23,0.2)] text-[#d4a017] text-[11px] uppercase tracking-[1.1px] font-bold font-sans px-3 py-1.5 rounded-[100px] mb-5">
              Benefício alimentação
            </span>
            <h2 className="text-[40px] text-white font-['DM_Serif_Display'] leading-tight mb-4">
              Pague com seu VA ou VR
            </h2>
            <p className="text-[16px] text-[rgba(255,255,255,0.65)] font-sans mb-10 leading-relaxed max-w-[470px]">
              Use seu benefício alimentação para pagar. Simples, rápido, sem complicação.
            </p>
            <div className="flex flex-wrap gap-3 mb-12">
              {brands.map((brand) => (
                <span
                  key={brand}
                  className="bg-[rgba(255,255,255,0.12)] border border-[rgba(255,255,255,0.28)] rounded-[100px] px-5 py-2.5 text-[14px] text-white font-bold font-sans tracking-[0.42px]"
                >
                  {brand}
                </span>
              ))}
            </div>
            <div className="h-px bg-[rgba(255,255,255,0.14)] w-full max-w-[420px] mb-5" />
            <p className="text-[13px] text-[rgba(255,255,255,0.55)] tracking-[0.13px] font-sans">
              Pix com desconto · Crédito e Débito · Parcelamento
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[480px] aspect-[4/3] rounded-[20px] shadow-[0px_24px_64px_0px_rgba(0,0,0,0.35)] overflow-hidden">
              <img src="/placeholder.svg" alt="Pessoa feliz comendo uma refeição Jilo" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default VaVrSection;
