import { Plus } from "lucide-react";

interface DishCard {
  name: string;
  price: string;
  badge?: string;
}

const allDishes: Record<string, DishCard[]> = {
  "Aves & Suínos": [
    { name: "Frango Grelhado ao Limão", price: "28,90", badge: "Mais Vendido" },
    { name: "Filé de Frango Parmegiana", price: "31,90" },
    { name: "Lombo Suíno com Mostarda", price: "33,90" },
    { name: "Frango ao Curry", price: "29,90" },
  ],
  "Bovinos": [
    { name: "Strogonoff de Carne", price: "32,90", badge: "Favorito" },
    { name: "Carne de Panela", price: "34,90" },
    { name: "Picadinho com Legumes", price: "30,90" },
    { name: "Escondidinho de Carne", price: "28,90" },
  ],
  "Peixes & Massas": [
    { name: "Salmão com Legumes", price: "39,90", badge: "Premium" },
    { name: "Tilápia ao Molho", price: "32,90" },
    { name: "Lasanha Bolonhesa", price: "29,90" },
    { name: "Penne ao Pesto", price: "27,90" },
  ],
  "Veganos": [
    { name: "Risoto de Cogumelos", price: "34,90", badge: "Vegano" },
    { name: "Bowl de Grão-de-Bico", price: "28,90" },
    { name: "Curry de Legumes", price: "26,90" },
    { name: "Hambúrguer de Lentilha", price: "25,90" },
  ],
};

const AllDishes = () => {
  return (
    <section id="cardapio" className="py-16 lg:py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-2 font-sans">Cardápio Completo</p>
          <h2 className="text-3xl lg:text-4xl">Todos os Pratos</h2>
        </div>

        {Object.entries(allDishes).map(([category, dishes]) => (
          <div key={category} className="mb-12 last:mb-0">
            <h3 className="text-xl lg:text-2xl mb-6 font-serif">{category}</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {dishes.map((dish) => (
                <div key={dish.name} className="group bg-card rounded-2xl overflow-hidden border hover:shadow-lg transition-shadow">
                  <div className="aspect-square bg-muted relative overflow-hidden">
                    <img src="/placeholder.svg" alt={dish.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    {dish.badge && (
                      <span className="absolute top-3 left-3 bg-accent text-accent-foreground text-[10px] font-bold uppercase px-2.5 py-1 rounded-full font-sans">
                        {dish.badge}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h4 className="font-sans font-semibold text-sm mb-1 line-clamp-2">{dish.name}</h4>
                    <div className="flex items-center justify-between mt-2">
                      <p className="font-bold text-primary font-sans">R$ {dish.price}</p>
                      <button className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default AllDishes;
