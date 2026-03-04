import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Snowflake, ArrowRight } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative min-h-[85vh] flex items-center bg-primary overflow-hidden">
      {/* Background placeholder */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/95 to-primary/70" />
      <div className="absolute inset-0 bg-[url('/placeholder.svg')] bg-cover bg-center opacity-10" />

      <div className="container mx-auto px-4 relative z-10 py-20 lg:py-0">
        <div className="max-w-[700px]">
          <p className="font-['DM_Sans'] font-normal text-[#d4a017] text-[14px] leading-[20px] tracking-[1.68px] uppercase mb-6">
            Comida para a vida real.
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-[56px] text-white leading-[1.05] mb-8 font-serif">
            Sua semana resolvida.<br className="hidden sm:block" />
            <span className="italic font-serif">Sem improviso,</span> sem culpa.
          </h1>
          <p className="text-[18px] text-[#faf7f2]/80 font-sans mb-10 leading-[27.9px]">
            26 pratos artesanais congelados, prontos em minutos.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mb-10">
            <a
              href="#cardapio"
              className="inline-flex items-center justify-center gap-3 rounded-[16px] bg-[#2d5016] text-white px-7 py-[16.8px] text-[16px] font-semibold font-sans hover:bg-[#2d5016]/90 transition-colors shadow-[0px_4px_24px_0px_rgba(0,0,0,0.25)]"
            >
              Montar meu Kit da Semana <ArrowRight className="w-[18px] h-[18px]" />
            </a>
            <a
              href="#cardapio"
              className="inline-flex items-center justify-center rounded-[16px] border border-[rgba(250,247,242,0.7)] text-white px-[28.8px] py-[16.8px] text-[16px] font-medium font-sans hover:bg-white/10 transition-colors"
            >
              Ver todos os pratos
            </a>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-[6px] bg-[rgba(30,58,30,0.55)] border-[0.8px] border-[rgba(255,255,255,0.18)] text-white rounded-full px-[14px] py-[6px] text-[12px] font-sans font-medium backdrop-blur-md">
              <CheckCircle2 className="h-[13px] w-[13px] text-[#d4a017]" /> Sem conservantes
            </span>
            <span className="inline-flex items-center gap-[6px] bg-[rgba(30,58,30,0.55)] border-[0.8px] border-[rgba(255,255,255,0.18)] text-white rounded-full px-[14px] py-[6px] text-[12px] font-sans font-medium backdrop-blur-md">
              <Clock className="h-[13px] w-[13px] text-[#d4a017]" /> Pronto em 5min
            </span>
            <span className="inline-flex items-center gap-[6px] bg-[rgba(30,58,30,0.55)] border-[0.8px] border-[rgba(255,255,255,0.18)] text-white rounded-full px-[14px] py-[6px] text-[12px] font-sans font-medium backdrop-blur-md">
              <Snowflake className="h-[13px] w-[13px] text-[#d4a017]" /> Congelado artesanal
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
