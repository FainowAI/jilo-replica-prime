import { ArrowRight } from "lucide-react";

const kits = [
  { name: "Kit Semana Leve", dishes: "5 pratos", price: "129,90", badge: "Mais Popular" },
  { name: "Kit Família", dishes: "10 pratos", price: "239,90", badge: "Melhor Custo" },
  { name: "Kit Fitness", dishes: "5 pratos", price: "149,90", badge: "Low Carb" },
  { name: "Kit Vegano", dishes: "5 pratos", price: "139,90", badge: "100% Vegetal" },
];

const WeeklyKits = () => {
  return (
    <section id="kits" className="py-16 lg:py-20 bg-primary">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-2 font-sans">Praticidade</p>
          <h2 className="text-3xl lg:text-4xl text-primary-foreground">Kits para a Semana</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {kits.map((kit) => (
            <div key={kit.name} className="bg-secondary/30 border border-primary-foreground/10 rounded-2xl p-6 hover:bg-secondary/50 transition-colors">
              <span className="inline-block bg-accent text-accent-foreground text-[10px] font-bold uppercase px-2.5 py-1 rounded-full font-sans mb-4">
                {kit.badge}
              </span>
              <h3 className="text-xl text-primary-foreground mb-2">{kit.name}</h3>
              <p className="text-primary-foreground/60 text-sm font-sans mb-4">{kit.dishes}</p>
              <p className="text-2xl font-bold text-accent font-sans">R$ {kit.price}</p>
              <p className="text-primary-foreground/40 text-xs font-sans mb-6">por semana</p>
              <a href="#cardapio" className="inline-flex items-center gap-2 text-accent font-semibold text-sm font-sans hover:gap-3 transition-all">
                Ver detalhes <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <a href="#cardapio" className="inline-flex items-center justify-center rounded-full border-2 border-primary-foreground/30 text-primary-foreground px-8 py-3 text-sm font-semibold font-sans hover:bg-primary-foreground/10 transition-colors">
            Ver todos os kits
          </a>
        </div>
      </div>
    </section>
  );
};

export default WeeklyKits;
