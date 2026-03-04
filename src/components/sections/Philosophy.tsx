import { ArrowRight } from "lucide-react";

const Philosophy = () => {
  return (
    <section id="sobre" className="relative py-20 lg:py-28 overflow-hidden bg-[#1e3a1e]">
      {/* Background Image Setup */}
      <div
        className="absolute inset-0 bg-[url('/placeholder.svg')] bg-cover bg-center"
        style={{ backgroundPosition: 'center right' }}
      />
      {/* Gradient Overlay from Figma */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "linear-gradient(90deg, rgba(30, 58, 30, 0.85) 0%, rgba(30, 58, 30, 0.7) 35%, rgba(30, 58, 30, 0.1) 60%, rgba(0, 0, 0, 0) 75%)" }}
      />

      <div className="container mx-auto px-4 relative z-10 flex h-full items-center">
        <div className="bg-[#d4a017] rounded-[24px] shadow-[0px_25px_50px_0px_rgba(0,0,0,0.25)] p-8 lg:p-10 max-w-[460px] w-full mt-4 mb-4 md:mt-0 md:mb-0 ml-0 md:ml-4">
          <div className="bg-[#1e3a1e]/10 rounded-full px-3 py-1.5 w-max mb-6">
            <p className="text-[#1e3a1e] text-[10px] uppercase tracking-[1.2px] font-sans font-medium">
              Nossa filosofia
            </p>
          </div>

          <h2 className="text-[34px] leading-[1.1] text-[#1e3a1e] mb-6 font-['DM_Serif_Display'] italic">
            Sem improviso.<br />
            Sem decisão.<br />
            Só prazer.
          </h2>

          <p className="text-[#1e3a1e]/70 font-sans mb-8 leading-[24px] text-[15px]">
            Planeje sua semana com a Jilo e tenha mais tempo para o que importa de verdade.
          </p>

          <a
            href="#cardapio"
            className="inline-flex items-center gap-2 text-[#1e3a1e] font-semibold text-[14px] font-sans hover:gap-3 transition-all underline decoration-solid decoration-[#1e3a1e] underline-offset-4"
          >
            Montar meu Kit <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
};

export default Philosophy;
