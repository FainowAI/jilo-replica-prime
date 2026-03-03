import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ShoppingBag, ChevronRight } from "lucide-react";

interface DishCard {
    name: string;
    price: string;
    pixPrice?: string;
    badge?: string;
    desc?: string;
}

const allDishes: Record<string, DishCard[]> = {
    "Aves & Suínos": [
        { name: "Filé de Frango Pizzaiolo", desc: "Frango ao molho pizzaiolo com queijo", price: "30,00", pixPrice: "24,90" },
        { name: "Estrogonofe de Frango", desc: "Frango cremoso com champignon e creme", price: "30,00", pixPrice: "24,90", badge: "⭐ Mais pedido" },
        { name: "Filé de Frango Desfiado", desc: "Frango desfiado temperado, low carb", price: "27,59", pixPrice: "22,90", badge: "Low Carb" },
        { name: "Filé de Frango Cubo Grelhado", desc: "Cubos de frango grelhado, sem glúten", price: "28,80", pixPrice: "23,90", badge: "Low Carb" },
        { name: "Feijoada", desc: "Feijão preto, costelinha e calabresa", price: "31,20", pixPrice: "25,90" },
        { name: "Sobrecoxa de Frango", desc: "Sobrecoxa assada com ervas finas", price: "26,39", pixPrice: "21,90", badge: "Novo" },
        { name: "Pernil Suíno Desfiado", desc: "Pernil suíno desfiado ao molho", price: "32,41", pixPrice: "26,90" },
    ],
    "Bovinos": [
        { name: "Patinho Moído", desc: "Patinho moído refogado com legumes", price: "28,80", pixPrice: "23,90" },
        { name: "Carne Louca Desfiada", desc: "Carne bovina desfiada ao molho", price: "31,20", pixPrice: "25,90" },
        { name: "Escondidinho de Carne Seca", desc: "Carne seca com purê de mandioca cremoso", price: "32,41", pixPrice: "26,90", badge: "⭐ Mais pedido" },
        { name: "Picadinho com Batatas", desc: "Picadinho bovino com batatas e tomates", price: "30,00", pixPrice: "24,90" },
        { name: "Almôndegas ao Sugo", desc: "Almôndegas artesanais ao sugo da casa", price: "27,59", pixPrice: "22,90" },
        { name: "Hambúrguer Artesanal", desc: "Hambúrguer 150g blend artesanal", price: "33,61", pixPrice: "27,90", badge: "Novo" },
        { name: "Iscas de Carne", desc: "Iscas bovinas ao molho especial", price: "31,20", pixPrice: "25,90" },
    ],
    "Peixes & Massas": [
        { name: "Tilápia Desfiada", desc: "Tilápia desfiada temperada, low carb", price: "34,82", pixPrice: "28,90", badge: "Low Carb" },
        { name: "Tilápia Grelhada", desc: "Filé de tilápia grelhado com ervas", price: "36,02", pixPrice: "29,90", badge: "Low Carb" },
        { name: "Linguiça Toscana Assada", desc: "Linguiça toscana assada com alecrim", price: "30,00", pixPrice: "24,90" },
        { name: "Panqueca de Frango e Calabresa", desc: "Panqueca recheada de frango e calabresa", price: "28,80", pixPrice: "23,90" },
        { name: "Lasanha Bolonhesa", desc: "Lasanha bolonhesa com massa caseira", price: "33,61", pixPrice: "27,90", badge: "⭐ Mais pedido" },
        { name: "Lasanha Bechamel com Calabresa", desc: "Lasanha ao molho bechamel com calabresa", price: "34,82", pixPrice: "28,90" },
    ],
    "Veganos": [
        { name: "Lasanha de Brócolis", desc: "Lasanha de brócolis com molho branco", price: "31,20", pixPrice: "25,90" },
        { name: "Escondidinho de Mandioca", desc: "Purê de mandioca recheado com legumes", price: "28,80", pixPrice: "23,90", badge: "Vegano" },
        { name: "Bolinho de Grão-de-Bico", desc: "Bolinhos assados de grão-de-bico", price: "26,39", pixPrice: "21,90" },
        { name: "Mix de Legumes Grelhados", desc: "Mix de legumes da estação grelhados", price: "25,18", pixPrice: "20,90", badge: "Novo" },
    ],
};

const categoryIcons: Record<string, string> = {
    "Aves & Suínos": "🍗",
    "Bovinos": "🥩",
    "Peixes & Massas": "🐟",
    "Veganos": "🌱",
};

export function FullMenu() {
    const [searchParams, setSearchParams] = useSearchParams();
    const currentCategory = searchParams.get("category") || "Todos";

    const categories = ["Todos", "Aves & Suínos", "Bovinos", "Peixes & Massas", "Veganos"];

    const handleCategoryClick = (cat: string) => {
        if (cat === "Todos") {
            searchParams.delete("category");
            setSearchParams(searchParams);
        } else {
            setSearchParams({ category: cat });
        }
    };

    const totalDishes = Object.values(allDishes).reduce((acc, catDishes) => acc + catDishes.length, 0);

    const displayedCategories = currentCategory === "Todos"
        ? allDishes
        : { [currentCategory]: allDishes[currentCategory] || [] };

    const displayedCount = Object.values(displayedCategories).reduce((acc, catDishes) => acc + catDishes.length, 0);

    return (
        <div className="py-8 lg:py-12">
            <div className="container mx-auto px-4">

                {/* Header Breadcrumbs */}
                <div className="flex items-center gap-2 text-sm text-foreground mb-8">
                    <a href="/" className="hover:underline font-sans">Página Inicial</a>
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-semibold text-foreground font-sans cursor-default">Cardápio</span>
                </div>

                {/* Header Text */}
                <div className="mb-10">
                    <h1 className="text-4xl lg:text-[42px] font-sans text-secondary-foreground mb-6 font-[400] tracking-tight">
                        Cardápio
                    </h1>
                    <p className="text-muted-foreground font-sans text-lg mb-2">
                        {totalDishes} pratos artesanais congelados. Prontos em minutos.
                    </p>
                    <p className="text-muted-foreground font-sans font-medium">
                        Exibindo {displayedCount} pratos.
                    </p>
                </div>

                {/* Filter Buttons */}
                <div className="flex overflow-x-auto gap-3 pb-4 mb-10 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                    {categories.map((cat) => {
                        const isSelected = currentCategory === cat;
                        const count = cat === "Todos" ? totalDishes : (allDishes[cat]?.length || 0);

                        return (
                            <button
                                key={cat}
                                onClick={() => handleCategoryClick(cat)}
                                className={`
                  flex items-center gap-2 px-5 py-2.5 rounded-[12px] font-sans text-sm font-semibold transition-all whitespace-nowrap
                  ${isSelected
                                        ? "bg-[#1F3328] text-white shadow-md cursor-default pointer-events-none"
                                        : "bg-[#F3F4ED] text-[#1F3328] hover:bg-[#EAF1EC]"
                                    }
                `}
                            >
                                <span>{cat}</span>
                                <span className={`px-2 py-[2px] rounded-md text-xs font-bold leading-none ${isSelected ? "bg-white/20 text-white" : "bg-[#1F3328]/10 text-[#1F3328]"}`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Dishes Sections */}
                <div className="space-y-16">
                    {Object.entries(displayedCategories).map(([categoryName, dishes]) => {
                        if (dishes.length === 0) return null;

                        return (
                            <div key={categoryName}>
                                {/* Section Header */}
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="text-2xl">{categoryIcons[categoryName]}</div>
                                    <h2 className="text-2xl font-serif text-secondary-foreground whitespace-nowrap">
                                        {categoryName}
                                    </h2>
                                    <div className="flex-1 h-px bg-border max-w-full" />
                                    <span className="text-muted-foreground font-sans text-sm font-medium whitespace-nowrap hidden sm:block">
                                        {dishes.length} pratos
                                    </span>
                                </div>

                                {/* Grid */}
                                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {dishes.map((dish, index) => (
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
                                                <h3 className="text-sm font-semibold text-secondary-foreground mb-1 font-sans leading-tight">
                                                    {dish.name}
                                                </h3>
                                                <p className="text-xs text-muted-foreground font-sans mb-4 line-clamp-2 min-h-[32px]">
                                                    {dish.desc}
                                                </p>

                                                <div className="flex items-center gap-3 mb-4 mt-auto">
                                                    <div className="text-muted-foreground text-sm font-sans line-through decoration-muted-foreground/40">
                                                        R$ {dish.price}
                                                    </div>
                                                    <div>
                                                        <span className="text-lg font-bold text-secondary-foreground font-sans leading-none">R$ {dish.pixPrice}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest ml-1 inline-block align-middle pb-0.5">PIX</span>
                                                    </div>
                                                </div>

                                                <button className="w-full bg-[#EAF1EC]/70 text-[#1F3328] font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 group-hover:bg-[#1F3328] group-hover:text-white transition-all duration-300 font-sans text-sm">
                                                    <ShoppingBag className="w-4 h-4" />
                                                    ADICIONAR
                                                </button>
                                            </div>

                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {displayedCount === 0 && (
                        <div className="py-20 text-center">
                            <p className="text-muted-foreground font-sans text-lg">Nenhum prato encontrado para esta categoria.</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
