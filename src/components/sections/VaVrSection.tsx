const brands = ["Alelo", "Sodexo", "VR", "Ticket", "Flash"];

const VaVrSection = () => {
  return (
    <section className="py-16 lg:py-24 bg-[#1e3a1e] flex justify-center w-full">
      <div className="container mx-auto px-4 lg:px-[32px] max-w-[1040px] w-full">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-[40px] items-center justify-between w-full">
          {/* Main Text Container */}
          <div className="flex flex-col items-start text-left w-full lg:w-[576px] shrink-0">
            <span className="inline-flex bg-[rgba(212,160,23,0.2)] text-[#d4a017] text-[11px] uppercase tracking-[1.1px] font-bold font-sans px-[12px] py-[4px] rounded-full mb-[40.5px]">
              Benefício alimentação
            </span>
            <h2 className="text-[40px] text-white font-['DM_Serif_Display'] leading-[44px] mb-[16px]">
              Pague com seu VA ou VR
            </h2>
            <p className="text-[16px] text-[rgba(255,255,255,0.65)] font-sans leading-[26.4px] w-full max-w-[470px] mb-[32px]">
              Use seu benefício alimentação para pagar. Simples, rápido, sem complicação.
            </p>

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-[10px] mb-[32px]">
              {brands.map((brand) => (
                <span
                  key={brand}
                  className="bg-[rgba(255,255,255,0.12)] border-[0.8px] border-[rgba(255,255,255,0.28)] rounded-[100px] h-[42.6px] px-[20px] pt-[10.6px] pb-[10.6px] flex items-center justify-center text-[14px] text-white font-bold font-sans tracking-[0.42px]"
                >
                  {brand}
                </span>
              ))}
            </div>

            <div className="h-px bg-[rgba(255,255,255,0.14)] w-full max-w-[420px] mb-[20px]" />
            <p className="text-[13px] text-[rgba(255,255,255,0.55)] tracking-[0.13px] leading-[19.5px] font-sans">
              Pix com desconto · Crédito e Débito · Parcelamento
            </p>
          </div>

          {/* Image Container */}
          <div className="flex justify-center lg:justify-end w-full lg:w-[384px] shrink-0 lg:pl-[40px]">
            <div className="relative w-full max-w-[344px] lg:w-[344px] h-[258px] rounded-[20px] shadow-[0px_24px_64px_0px_rgba(0,0,0,0.35)] overflow-hidden">
              <img src="/placeholder.svg" alt="Pessoa feliz comendo uma refeição Jilo" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default VaVrSection;
