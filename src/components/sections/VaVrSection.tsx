const brands = ["Alelo", "Sodexo", "VR", "Ticket", "Flash"];

const VaVrSection = () => {
  return (
    <section className="py-16 lg:py-20 bg-secondary">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-3 font-sans">Facilidade</p>
            <h2 className="text-3xl lg:text-4xl text-secondary-foreground mb-4">
              Pague com VA/VR. Simples assim.
            </h2>
            <p className="text-secondary-foreground/70 font-sans mb-8 leading-relaxed max-w-md">
              Aceitamos as principais bandeiras de vale-alimentação e vale-refeição. Cuide da sua alimentação usando o benefício que você já tem.
            </p>
            <div className="flex flex-wrap gap-3">
              {brands.map((brand) => (
                <span
                  key={brand}
                  className="bg-secondary-foreground/10 text-secondary-foreground border border-secondary-foreground/10 rounded-full px-5 py-2 text-sm font-semibold font-sans"
                >
                  {brand}
                </span>
              ))}
            </div>
          </div>
          <div className="aspect-[4/3] bg-secondary-foreground/5 rounded-2xl overflow-hidden">
            <img src="/placeholder.svg" alt="Lifestyle" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default VaVrSection;
