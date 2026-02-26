const metrics = [
  { value: "+2.400", label: "Clientes satisfeitos" },
  { value: "24", label: "Pratos no cardápio" },
  { value: "0", label: "Conservantes" },
];

const OurStory = () => {
  return (
    <section className="py-16 lg:py-20 bg-card">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-3 font-sans">Quem somos</p>
          <h2 className="text-3xl lg:text-4xl mb-6">Nossa História</h2>
          <p className="text-muted-foreground font-sans leading-relaxed mb-4">
            A Jilo nasceu da vontade de democratizar a comida boa. Cansamos de ver que, para comer bem no dia a dia, era preciso tempo, dinheiro ou habilidade na cozinha.
          </p>
          <p className="text-muted-foreground font-sans leading-relaxed mb-10">
            Criamos pratos que unem praticidade e sabor real: feitos com ingredientes frescos, por chefs de verdade, congelados no ponto certo. Sem conservantes, sem atalhos.
          </p>
          <div className="grid grid-cols-3 gap-6 mb-10">
            {metrics.map((m) => (
              <div key={m.label}>
                <p className="text-3xl lg:text-4xl font-serif text-primary font-bold">{m.value}</p>
                <p className="text-xs text-muted-foreground font-sans mt-1">{m.label}</p>
              </div>
            ))}
          </div>
          <a href="#sobre" className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-8 py-3 text-sm font-semibold font-sans hover:bg-primary/90 transition-colors">
            Conheça nossa história
          </a>
        </div>
      </div>
    </section>
  );
};

export default OurStory;
