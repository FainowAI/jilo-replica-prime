import { ShoppingCart, Package, Flame } from "lucide-react";

const steps = [
  { icon: ShoppingCart, title: "Escolha", desc: "Monte seu kit com os pratos que mais gosta" },
  { icon: Package, title: "Receba", desc: "Entrega congelada em até 48h na sua casa" },
  { icon: Flame, title: "Aqueça", desc: "Pronto em 6 minutos no micro-ondas ou forno" },
];

const HowItWorks = () => {
  return (
    <section id="como-funciona" className="py-16 lg:py-20 bg-card">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-2 font-sans">Simples e Prático</p>
          <h2 className="text-3xl lg:text-4xl">Como Funciona</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto">
          {steps.map((step, i) => (
            <div key={step.title} className="text-center relative">
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-8 left-[60%] w-[80%] border-t-2 border-dashed border-accent/30" />
              )}
              <div className="w-16 h-16 rounded-full bg-accent text-accent-foreground flex items-center justify-center mx-auto mb-4 relative z-10">
                <step.icon className="h-7 w-7" />
              </div>
              <h3 className="text-lg mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground font-sans max-w-[200px] mx-auto">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
