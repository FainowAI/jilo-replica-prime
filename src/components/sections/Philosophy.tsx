import { ArrowRight } from "lucide-react";

const Philosophy = () => {
  return (
    <section id="sobre" className="relative py-24 lg:py-32 bg-primary overflow-hidden">
      <div className="absolute inset-0 bg-[url('/placeholder.svg')] bg-cover bg-center opacity-5" />
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-xl ml-auto">
          <div className="bg-accent/10 border border-accent/30 backdrop-blur-sm rounded-2xl p-8 lg:p-12">
            <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-3 font-sans">Nossa Filosofia</p>
            <h2 className="text-3xl lg:text-4xl text-primary-foreground mb-4">
              Comida que cuida de você
            </h2>
            <p className="text-primary-foreground/80 font-sans mb-6 leading-relaxed">
              Acreditamos que comer bem não precisa ser complicado. Cada prato é desenvolvido por nossos chefs com ingredientes selecionados, sem conservantes, sem atalhos. É comida de verdade, feita com afeto e pronta para sua rotina.
            </p>
            <a
              href="#cardapio"
              className="inline-flex items-center gap-2 text-accent font-semibold text-sm font-sans hover:gap-3 transition-all"
            >
              Montar meu Kit <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Philosophy;
