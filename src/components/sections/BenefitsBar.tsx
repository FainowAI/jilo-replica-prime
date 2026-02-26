import { Star, CreditCard, Truck, ChefHat } from "lucide-react";

const benefits = [
  { icon: Star, label: "Avaliação 4,7/5", sub: "+2.400 clientes" },
  { icon: CreditCard, label: "5% OFF no PIX", sub: "Pagamento à vista" },
  { icon: Truck, label: "Entrega em 48h", sub: "Direto na sua porta" },
  { icon: ChefHat, label: "Feito artesanalmente", sub: "Com ingredientes reais" },
];

const BenefitsBar = () => {
  return (
    <section className="py-8 lg:py-12 bg-card border-b">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {benefits.map((b) => (
            <div key={b.label} className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                <b.icon className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-semibold text-sm font-sans">{b.label}</p>
                <p className="text-xs text-muted-foreground font-sans">{b.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BenefitsBar;
