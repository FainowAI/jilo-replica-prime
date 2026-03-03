import { ArrowRight } from "lucide-react";

const kits = [
  { name: "Kit Semana Completa", dishes: "20 pratos · Para a semana toda", price: "19,90/un", badge: "Mais vendido" },
  { name: "Kit Econômico", dishes: "14 pratos · Custo benefício", price: "18,90/un", badge: "" },
  { name: "Kit Fit & Saudável", dishes: "10 pratos Low Carb · Para uma rotina mais leve", price: "21,90/un", badge: "Novo" },
  { name: "Kit Vegano", dishes: "10 pratos · 100% Plant-based", price: "20,90/un", badge: "" },
];

const WeeklyKits = () => {
  return (
    <section id="kits" className="py-16 lg:py-20 bg-primary">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-2 font-sans">Monte do seu jeito</p>
          <h2 className="text-3xl lg:text-4xl text-primary-foreground mb-4">Kits para a Semana</h2>
          <p className="text-primary-foreground/80 font-sans max-w-lg mx-auto">
            Monte sua semana de uma vez. Mais fácil, mais barato.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {kits.map((kit) => (
            <div key={kit.name} className="bg-secondary/30 border border-primary-foreground/10 rounded-2xl p-6 hover:bg-secondary/50 transition-colors flex flex-col">
              <div className="min-h-[28px] mb-4">
                {kit.badge && (
                  <span className="inline-block bg-accent text-accent-foreground text-[10px] font-bold uppercase px-2.5 py-1 rounded-full font-sans">
                    {kit.badge}
                  </span>
                )}
              </div>
              <h3 className="text-xl text-primary-foreground mb-2">{kit.name}</h3>
              <p className="text-primary-foreground/60 text-sm font-sans mb-8">{kit.dishes}</p>
              <div className="mt-auto">
                <p className="text-2xl font-bold text-accent font-sans mb-4">
                  <span className="text-sm text-primary-foreground/60 font-normal block font-sans">a partir de</span>
                  R$ {kit.price}
                </p>
                <a href="#cardapio" className="inline-flex items-center gap-2 text-accent font-semibold text-sm font-sans hover:gap-3 transition-all">
                  Ver Kit <ArrowRight className="h-4 w-4" />
                </a>
              </div>
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
