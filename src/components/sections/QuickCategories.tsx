const categories = [
  "Aves & Suínos",
  "Bovinos",
  "Peixes & Massas",
  "Veganos",
];

const QuickCategories = () => {
  return (
    <section className="py-10 lg:py-14">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {categories.map((cat) => (
            <a
              key={cat}
              href="#cardapio"
              className="rounded-full border-2 border-primary/20 px-6 py-2.5 text-sm font-semibold font-sans text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              {cat}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default QuickCategories;
