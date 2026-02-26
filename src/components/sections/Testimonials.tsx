import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Mariana S.",
    text: "Mudou minha rotina! Os pratos são deliciosos e super práticos. Não volto mais para delivery.",
    stars: 5,
  },
  {
    name: "Carlos R.",
    text: "Qualidade incrível. O salmão é melhor que restaurante. Minha família toda aprovou.",
    stars: 5,
  },
  {
    name: "Fernanda L.",
    text: "Sou vegana e finalmente encontrei opções congeladas gostosas de verdade. Recomendo demais!",
    stars: 5,
  },
];

const Testimonials = () => {
  return (
    <section className="py-16 lg:py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-2 font-sans">Depoimentos</p>
          <h2 className="text-3xl lg:text-4xl">O que nossos clientes dizem</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-card rounded-2xl border p-6">
              <div className="flex gap-1 mb-4">
                {Array.from({ length: t.stars }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 text-accent fill-accent" />
                ))}
              </div>
              <p className="text-sm font-sans text-foreground/80 mb-4 leading-relaxed">"{t.text}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm font-sans">
                  {t.name[0]}
                </div>
                <p className="font-semibold text-sm font-sans">{t.name}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
