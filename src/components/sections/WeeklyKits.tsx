import { useState } from "react";
import { ArrowRight } from "lucide-react";

const QUANTITIES = [7, 14, 21, 28] as const;
type Qty = typeof QUANTITIES[number];

interface Kit {
  name: string;
  tagline: string;
  badges: string[];
  prices: Record<Qty, number>;
}

const kits: Kit[] = [
  {
    name: "Aves & Suínos",
    tagline: "Leve e saboroso para o dia a dia",
    badges: ["⭐ Mais pedido"],
    prices: { 7: 119.32, 14: 225.39, 21: 318.19, 28: 397.74 },
  },
  {
    name: "Peixes & Massas",
    tagline: "Proteína leve com muito sabor",
    badges: [],
    prices: { 7: 127.89, 14: 241.57, 21: 341.04, 28: 426.30 },
  },
  {
    name: "Bovinos",
    tagline: "Carne de qualidade, sem trabalho",
    badges: [],
    prices: { 7: 161.91, 14: 305.83, 21: 431.76, 28: 539.70 },
  },
  {
    name: "Veganos",
    tagline: "Plant-based cheio de sabor e nutrição",
    badges: ["🌱 Vegano"],
    prices: { 7: 161.91, 14: 305.83, 21: 431.76, 28: 539.70 },
  },
];

const formatPrice = (value: number) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const KitCard = ({ kit }: { kit: Kit }) => {
  const [selected, setSelected] = useState<Qty>(7);

  return (
    <div className="bg-secondary/30 border border-primary-foreground/10 rounded-2xl p-6 hover:bg-secondary/50 transition-colors flex flex-col">
      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 min-h-[28px] mb-4">
        <span className="inline-block bg-accent text-accent-foreground text-[10px] font-bold uppercase px-2.5 py-1 rounded-full font-sans">
          até 25% OFF
        </span>
        {kit.badges.map((b) => (
          <span
            key={b}
            className="inline-block bg-accent/20 text-accent text-[10px] font-bold px-2.5 py-1 rounded-full font-sans"
          >
            {b}
          </span>
        ))}
      </div>

      {/* Info */}
      <h3 className="text-xl text-primary-foreground mb-1">Kit {kit.name}</h3>
      <p className="text-primary-foreground/60 text-sm font-sans mb-6">{kit.tagline}</p>

      {/* Quantity selector */}
      <div className="flex gap-1.5 mb-6">
        {QUANTITIES.map((q) => (
          <button
            key={q}
            onClick={() => setSelected(q)}
            className={`flex-1 text-xs font-semibold font-sans py-2 rounded-lg transition-colors ${
              selected === q
                ? "bg-accent text-accent-foreground"
                : "bg-primary-foreground/10 text-primary-foreground/70 hover:bg-primary-foreground/20"
            }`}
          >
            {q}un
          </button>
        ))}
      </div>

      {/* Price + CTA */}
      <div className="mt-auto">
        <p className="text-2xl font-bold text-accent font-sans mb-1">
          <span className="text-sm text-primary-foreground/60 font-normal block font-sans">
            {selected === 7 ? "a partir de" : `${selected} marmitas`}
          </span>
          R$ {formatPrice(kit.prices[selected])}
        </p>
        <p className="text-[11px] text-primary-foreground/50 font-sans mb-4">+ 5% OFF no Pix</p>

        <a
          href="#cardapio"
          className="inline-flex items-center gap-2 text-accent font-semibold text-sm font-sans hover:gap-3 transition-all"
        >
          Montar Kit <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
};

const WeeklyKits = () => {
  return (
    <section id="kits" className="py-16 lg:py-20 bg-primary">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-2 font-sans">
            Monte do seu jeito
          </p>
          <h2 className="text-3xl lg:text-4xl text-primary-foreground mb-4">Kits para a Semana</h2>
          <p className="text-primary-foreground/80 font-sans max-w-lg mx-auto">
            Monte sua semana de uma vez. Mais fácil, mais barato.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {kits.map((kit) => (
            <KitCard key={kit.name} kit={kit} />
          ))}
        </div>
        <div className="text-center mt-10">
          <a
            href="#cardapio"
            className="inline-flex items-center justify-center rounded-full border-2 border-primary-foreground/30 text-primary-foreground px-8 py-3 text-sm font-semibold font-sans hover:bg-primary-foreground/10 transition-colors"
          >
            Ver todos os kits
          </a>
        </div>
      </div>
    </section>
  );
};

export default WeeklyKits;
