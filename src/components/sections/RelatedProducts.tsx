import { ChevronRight, ShoppingBag } from "lucide-react";

const relatedProducts = [
    {
        name: "Filé de Frango Pizzaiolo",
        price: "23,90",
        pixPrice: "22,71",
        badge: "⭐ Mais pedido",
    },
    {
        name: "Sobrecoxa de Frango",
        price: "22,90",
        pixPrice: "21,76",
    },
    {
        name: "Pernil Suíno Desfiado",
        price: "25,90",
        pixPrice: "24,61",
        badge: "🌱 Sem glúten",
    },
    {
        name: "Filé de Frango Cubo Grelhado",
        price: "21,90",
        pixPrice: "20,81",
    },
];

export function RelatedProducts() {
    return (
        <section className="py-16 lg:py-24">
            <div className="container mx-auto px-4">

                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground mb-3 font-sans">Da mesma categoria</p>
                        <h2 className="text-3xl lg:text-4xl text-secondary-foreground mb-4">
                            Aproveite e leve também
                        </h2>
                        <p className="text-muted-foreground font-sans">
                            Separamos alguns pratos que combinam com esse.
                        </p>
                    </div>

                    <a href="/#cardapio" className="flex items-center gap-2 text-primary font-medium hover:text-primary/80 transition-colors font-sans whitespace-nowrap">
                        Ver todos os pratos <ChevronRight className="w-4 h-4" />
                    </a>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {relatedProducts.map((dish, index) => (
                        <div key={index} className="group cursor-pointer flex flex-col h-full bg-background rounded-2xl overflow-hidden border border-border hover:shadow-md transition-all duration-300">
                            <div className="aspect-square bg-secondary relative overflow-hidden">
                                <img
                                    src="/placeholder.svg"
                                    alt={dish.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                {dish.badge && (
                                    <span className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm text-secondary-foreground text-xs font-semibold px-3 py-1.5 rounded-full font-sans shadow-sm">
                                        {dish.badge}
                                    </span>
                                )}
                            </div>
                            <div className="p-5 flex flex-col flex-1">
                                <h3 className="font-semibold text-secondary-foreground mb-2 flex-1 font-sans leading-tight line-clamp-2">
                                    {dish.name}
                                </h3>
                                <div className="flex flex-col gap-1 mb-4">
                                    <div className="text-lg font-bold text-secondary-foreground bg-secondary/30 px-3 py-1.5 rounded-lg w-fit">
                                        R$ {dish.price}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-sans px-1">
                                        <span className="font-semibold text-secondary-foreground">R$ {dish.pixPrice}</span>
                                        <span>via Pix</span>
                                    </div>
                                </div>
                                <button className="w-full bg-primary/10 text-primary font-medium py-2.5 rounded-xl flex items-center justify-center gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                                    <ShoppingBag className="w-4 h-4" />
                                    Adicionar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}
