import { ArrowRight, Box } from "lucide-react";

interface Kit {
  name: string;
  tagline: string;
  badge?: string;
  price: string;
  bgColor: string;
}

const kits: Kit[] = [
  {
    name: "Kit Semana Completa",
    tagline: "20 pratos · Para a semana toda",
    badge: "Mais vendido",
    price: "19,90",
    bgColor: "bg-[#1e3a1e]",
  },
  {
    name: "Kit Econômico",
    tagline: "14 pratos · Custo benefício",
    price: "18,90",
    bgColor: "bg-[#6b4226]",
  },
  {
    name: "Kit Fit & Saudável",
    tagline: "10 pratos Low Carb · Para uma rotina mais leve",
    badge: "Novo",
    price: "21,90",
    bgColor: "bg-[#2c3e50]",
  },
  {
    name: "Kit Vegano",
    tagline: "10 pratos · 100% Plant-based",
    price: "20,90",
    bgColor: "bg-[#4a5c2f]",
  },
];

const KitCard = ({ kit }: { kit: Kit }) => {
  return (
    <div className={`relative flex flex-col rounded-[20px] overflow-hidden ${kit.bgColor} min-h-[280px]`}>
      {/* Background Gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: "linear-gradient(155.65deg, rgba(255,255,255,0.06) 8.49%, rgba(0,0,0,0) 58.3%)" }}
      />

      <div className="relative p-6 flex flex-col h-full z-10">
        <div className="flex items-start justify-between min-h-[24px]">
          {kit.badge ? (
            <span className="inline-flex bg-[#d4a017] text-[#1e3a1e] text-[11px] font-bold px-2.5 py-1 rounded-[100px] font-sans">
              {kit.badge}
            </span>
          ) : (
            <span />
          )}
          <Box className="w-5 h-5 text-white opacity-80" strokeWidth={1.5} />
        </div>

        <div className="mt-4 mb-8">
          <h3 className="text-white text-[24px] font-['DM_Serif_Display'] leading-[27.6px] mb-1">
            {kit.name}
          </h3>
          <p className="text-[13px] text-white/70 font-sans leading-[18.2px]">
            {kit.tagline}
          </p>
        </div>

        <div className="mt-auto pt-4 border-t border-white/15 flex items-center justify-between">
          <div>
            <span className="text-[13px] text-white/85 font-medium font-sans">a partir de</span>
            <br />
            <span className="text-[15px] font-bold text-white font-sans">
              R$ {kit.price}/un
            </span>
          </div>

          <a
            href="#cardapio"
            className="inline-flex items-center gap-2 border border-white/50 rounded-[100px] px-3 py-2 text-[13px] text-white font-semibold font-sans hover:bg-white/10 transition-colors"
          >
            Ver Kit
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};

const WeeklyKits = () => {
  return (
    <section id="kits" className="py-16 lg:py-20 bg-white">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex flex-col items-center text-center mb-10 gap-1.5">
          <p className="bg-[rgba(30,58,30,0.08)] text-[#2d5016] text-[12px] uppercase tracking-[1.2px] font-semibold font-sans px-[24px] py-[4px] rounded-[100px]">
            Monte do seu jeito
          </p>
          <h2 className="text-[36px] text-[#1e3a1e] font-['DM_Serif_Display'] leading-tight mt-1">
            Kits para a Semana
          </h2>
          <p className="text-[16px] text-[#6b6b6b] font-sans mt-2 max-w-lg mx-auto">
            Monte sua semana de uma vez. Mais fácil, mais barato, mais organizado.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {kits.map((kit) => (
            <KitCard key={kit.name} kit={kit} />
          ))}
        </div>

        <div className="text-center mt-12">
          <a
            href="#cardapio"
            className="inline-flex items-center gap-2 border border-[#1e3a1e] text-[#1e3a1e] rounded-[100px] px-8 py-3 text-[14px] font-semibold font-sans hover:bg-[#1e3a1e]/5 transition-colors"
          >
            Ver todos os kits
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
};

export default WeeklyKits;
