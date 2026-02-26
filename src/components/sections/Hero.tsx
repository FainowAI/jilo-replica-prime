import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Clock, Leaf } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative min-h-[85vh] flex items-center bg-primary overflow-hidden">
      {/* Background placeholder */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/95 to-primary/70" />
      <div className="absolute inset-0 bg-[url('/placeholder.svg')] bg-cover bg-center opacity-10" />

      <div className="container mx-auto px-4 relative z-10 py-20 lg:py-0">
        <div className="max-w-2xl">
          <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-4 font-sans">
            Comida de verdade, sem complicação
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl text-primary-foreground leading-[1.1] mb-6">
            Sua semana resolvida. Sem improviso, sem culpa.
          </h1>
          <p className="text-primary-foreground/80 text-lg sm:text-xl mb-8 font-sans max-w-lg">
            Pratos artesanais, congelados com carinho e prontos em minutos. Para quem valoriza praticidade sem abrir mão do sabor.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mb-10">
            <a
              href="#cardapio"
              className="inline-flex items-center justify-center rounded-full bg-accent text-accent-foreground px-8 py-4 text-base font-bold hover:bg-accent/90 transition-colors"
            >
              Montar meu Kit
            </a>
            <a
              href="#como-funciona"
              className="inline-flex items-center justify-center rounded-full border-2 border-primary-foreground/30 text-primary-foreground px-8 py-4 text-base font-semibold hover:bg-primary-foreground/10 transition-colors"
            >
              Como funciona
            </a>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1.5 bg-primary-foreground/10 backdrop-blur-sm text-primary-foreground rounded-full px-4 py-2 text-xs font-sans font-medium">
              <Star className="h-3.5 w-3.5 text-accent fill-accent" /> 4,7/5 avaliação
            </span>
            <span className="inline-flex items-center gap-1.5 bg-primary-foreground/10 backdrop-blur-sm text-primary-foreground rounded-full px-4 py-2 text-xs font-sans font-medium">
              <Clock className="h-3.5 w-3.5" /> Pronto em 6 min
            </span>
            <span className="inline-flex items-center gap-1.5 bg-primary-foreground/10 backdrop-blur-sm text-primary-foreground rounded-full px-4 py-2 text-xs font-sans font-medium">
              <Leaf className="h-3.5 w-3.5" /> 0 conservantes
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
