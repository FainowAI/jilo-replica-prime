import { Plus } from "lucide-react";

const favorites = [
  { name: "Estrogonofe de Frango", price: "24,90", badge: "⭐ Mais pedido" },
  { name: "Escondidinho de Carne Seca", price: "26,90", badge: "⭐ Mais pedido" },
  { name: "Lasanha Bolonhesa", price: "27,90", badge: "⭐ Mais pedido" },
  { name: "Curry de Lentilha Vermelha com Leite de Coco", price: "23,90", badge: "🌱 Vegano" },
];

const Favorites = () => {
  return (
    <section className="py-16 lg:py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-2 font-sans">Destaques</p>
          <h2 className="text-3xl lg:text-4xl">Os Favoritos da Galera</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {favorites.map((item) => (
            <div key={item.name} className="group bg-card rounded-2xl overflow-hidden border hover:shadow-lg transition-shadow">
              <div className="aspect-square bg-muted relative overflow-hidden">
                <img src="/placeholder.svg" alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <span className="absolute top-3 left-3 bg-accent text-accent-foreground text-[10px] font-bold uppercase px-2.5 py-1 rounded-full font-sans">
                  {item.badge}
                </span>
              </div>
              <div className="p-4">
                <h3 className="font-sans font-semibold text-sm mb-1 line-clamp-2">{item.name}</h3>
                <div className="flex items-center justify-between mt-2">
                  <p className="font-bold text-primary font-sans">R$ {item.price}</p>
                  <button className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Favorites;
