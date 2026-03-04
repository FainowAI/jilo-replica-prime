import { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ShoppingBag, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORY_ORDER = ["Aves e Suinos", "Bovinos", "Peixes e Massas", "Veganos"];

const categoryIcons: Record<string, string> = {
    "Aves e Suinos": "🍗",
    "Bovinos": "🥩",
    "Peixes e Massas": "🐟",
    "Veganos": "🌱",
};

const TAG_BADGES: Record<string, { label: string; className: string }> = {
    "mais-pedido": { label: "⭐ Mais pedido", className: "bg-yellow-100 text-yellow-800" },
    "vegano": { label: "🌱 Vegano", className: "bg-green-100 text-green-800" },
    "low-carb": { label: "Low Carb", className: "bg-muted text-muted-foreground" },
    "novo": { label: "Novo", className: "bg-accent text-accent-foreground" },
};

function getBadge(tags: string[]) {
    for (const tag of tags) {
        const normalized = tag.toLowerCase().trim();
        if (TAG_BADGES[normalized]) return TAG_BADGES[normalized];
    }
    return null;
}

function formatPrice(amount: string) {
    return parseFloat(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SkeletonGrid() {
    return (
        <div className="space-y-16">
            {CATEGORY_ORDER.map((cat) => (
                <div key={cat}>
                    <Skeleton className="h-8 w-48 mb-8" />
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="rounded-2xl overflow-hidden border border-border">
                                <Skeleton className="aspect-square w-full" />
                                <div className="p-5 space-y-3">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-3 w-full" />
                                    <Skeleton className="h-5 w-1/2" />
                                    <Skeleton className="h-10 w-full rounded-xl" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

export function FullMenu() {
    const [searchParams, setSearchParams] = useSearchParams();
    const currentCategory = searchParams.get("category") || "Todos";

    const [grouped, setGrouped] = useState<Record<string, ShopifyProduct[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    // Novas states para pesquisa e ordenação
    const [searchQuery, setSearchQuery] = useState("");
    const [sortOption, setSortOption] = useState("Relevância");

    const addItem = useCartStore((s) => s.addItem);
    const isLoading = useCartStore((s) => s.isLoading);

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const data = await storefrontApiRequest(PRODUCTS_QUERY, { first: 50 });
            const products: ShopifyProduct[] = data?.data?.products?.edges || [];
            const groups: Record<string, ShopifyProduct[]> = {};
            for (const product of products) {
                const type = product.node.productType || "Outros";
                if (!groups[type]) groups[type] = [];
                groups[type].push(product);
            }
            setGrouped(groups);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchProducts(); }, [fetchProducts]);

    const handleAdd = (product: ShopifyProduct) => {
        const variant = product.node.variants.edges[0]?.node;
        if (!variant) return;
        addItem({
            product,
            variantId: variant.id,
            variantTitle: variant.title,
            price: variant.price,
            quantity: 1,
            selectedOptions: variant.selectedOptions || [],
        });
    };

    const allCategories = [
        ...CATEGORY_ORDER.filter((c) => grouped[c]),
        ...Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c)),
    ];

    const categories = ["Todos", ...allCategories];

    const totalDishes = Object.values(grouped).reduce((acc, arr) => acc + arr.length, 0);

    const displayedCategories = currentCategory === "Todos"
        ? grouped
        : { [currentCategory]: grouped[currentCategory] || [] };

    // Filtro de Busca
    const searchedCategories = Object.entries(displayedCategories).reduce((acc, [cat, products]) => {
        const filtered = products.filter(p =>
            p.node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            cat.toLowerCase().includes(searchQuery.toLowerCase())
        );
        if (filtered.length > 0) acc[cat] = filtered;
        return acc;
    }, {} as Record<string, ShopifyProduct[]>);

    // Ordenação
    const sortedSearchedCategories = Object.entries(searchedCategories).reduce((acc, [cat, products]) => {
        const sorted = [...products];
        switch (sortOption) {
            case "Ordem alfabética":
                sorted.sort((a, b) => a.node.title.localeCompare(b.node.title));
                break;
            case "Menor preço":
                sorted.sort((a, b) => parseFloat(a.node.priceRange.minVariantPrice.amount) - parseFloat(b.node.priceRange.minVariantPrice.amount));
                break;
            case "Maior preço":
                sorted.sort((a, b) => parseFloat(b.node.priceRange.minVariantPrice.amount) - parseFloat(a.node.priceRange.minVariantPrice.amount));
                break;
            case "Maior desconto":
                sorted.sort((a, b) => {
                    const getDiscount = (p: ShopifyProduct) => {
                        const variant = p.node.variants.edges[0]?.node;
                        if (!variant || !variant.compareAtPrice) return 0;
                        return parseFloat(variant.compareAtPrice.amount) - parseFloat(variant.price.amount);
                    };
                    return getDiscount(b) - getDiscount(a);
                });
                break;
            // "Relevância" e "Mais vendidos" usam a ordem padrão (como retornada pela API)
        }
        acc[cat] = sorted;
        return acc;
    }, {} as Record<string, ShopifyProduct[]>);

    const displayedCount = Object.values(sortedSearchedCategories).reduce((acc, arr) => acc + arr.length, 0);

    const handleCategoryClick = (cat: string) => {
        if (cat === "Todos") {
            searchParams.delete("category");
            setSearchParams(searchParams);
        } else {
            setSearchParams({ category: cat });
        }
    };

    return (
        <div className="w-full bg-[#faf7f2] min-h-screen pb-[64px]">
            {/* 1. Breadcrumb (Node 9:7) */}
            <div className="w-full border-b-[0.8px] border-[#e8e8e4] flex items-center px-4 lg:px-[40px] py-[24px]">
                <a href="/" className="font-['DM_Sans'] text-[13px] leading-[13px] text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors">
                    Página Inicial
                </a>
                <ChevronRight className="w-3 h-3 text-[#1a1a1a] mx-2" />
                <span className="font-['DM_Sans'] font-medium text-[13px] leading-[13px] text-[#1a1a1a]">
                    Cardápio
                </span>
            </div>

            {/* 2. Header and Category Buttons (Node 9:16) */}
            <div className="w-full px-4 lg:px-[40px] pt-[40px] pb-[32px] bg-[#faf7f2] sticky top-[64px] z-40">
                <h1 className="font-['DM_Serif_Display'] text-[41.6px] leading-[42px] text-[#1a1a1a] mb-[8.4px]">
                    Cardápio
                </h1>

                {!loading && !error && (
                    <>
                        <p className="font-['DM_Sans'] text-[16px] leading-[22.4px] text-[#6b6b6b] mb-[4px]">
                            {totalDishes} pratos artesanais congelados. Prontos em minutos.
                        </p>
                        <p className="font-['DM_Sans'] text-[13px] leading-[19.5px] text-[#b0aea8] mb-[24px]">
                            Exibindo {displayedCount} pratos.
                        </p>

                        {/* Search and Sort Tools inline */}
                        <div className="w-full flex flex-col lg:flex-row lg:justify-between border-t border-[#e8e8e4]/50 py-[12px] lg:h-[48px] lg:items-center">
                            {/* Search Bar (Node 9:784) */}
                            <div className="flex items-center gap-[12px] h-full mb-4 lg:mb-0 w-full lg:w-auto">
                                <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1a1a1a]">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Buscar pratos, categorias…"
                                    className="flex-1 lg:w-[300px] font-['DM_Sans'] text-[15px] text-[#1a1a1a] bg-transparent border-none outline-none placeholder:text-[rgba(26,26,26,0.5)] h-full"
                                />
                            </div>

                            {/* 4. Sorting Filter Options (Node 9:726) */}
                            <div className="flex gap-[24px] h-full lg:items-end w-full lg:w-auto overflow-x-auto no-scrollbar">
                                {["Relevância", "Ordem alfabética", "Mais vendidos", "Menor preço", "Maior preço"].map((option) => {
                                    const isSelected = option === sortOption;
                                    return (
                                        <button
                                            key={option}
                                            onClick={() => setSortOption(option)}
                                            className={`h-[24px] lg:h-[18.6px] relative flex justify-center border-b-[1.6px] pb-1 cursor-pointer transition-colors
                                                ${isSelected ? "border-[#d4a017]" : "border-transparent hover:border-[#e8e8e4]"}
                                            `}
                                        >
                                            <span className={`font-['DM_Sans'] text-[13px] leading-[13px] whitespace-nowrap 
                                                ${isSelected ? "font-semibold text-[#1a1a1a]" : "font-normal text-[#9b9b9b] hover:text-[#1a1a1a]"}`}>
                                                {option}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Category Buttons aligned inline matching 9:16 layout */}
                        <div className="flex flex-wrap gap-[8px] items-start pt-4 border-t border-[#e8e8e4]/50">
                            {categories.map((cat) => {
                                const isSelected = currentCategory === cat;
                                const count = cat === "Todos" ? totalDishes : (grouped[cat]?.length || 0);

                                return (
                                    <button
                                        key={cat}
                                        onClick={() => handleCategoryClick(cat)}
                                        className={`flex items-center gap-[6px] h-[34.8px] rounded-[100px] px-[16px] transition-all border-[0.8px]
                                            ${isSelected
                                                ? "bg-[#1e3a1e] text-[#faf7f2] border-[#1e3a1e]"
                                                : "bg-[#ffffff] border-[#e8e8e4] text-[#1a1a1a] hover:border-gray-400"
                                            }`}
                                    >
                                        <span className="font-['DM_Sans'] text-[13px] font-semibold leading-[13px]">{cat}</span>
                                        <span className={`font-['DM_Sans'] text-[11px] font-semibold leading-[13px] px-[6px] py-[2px] rounded-[100px] 
                                            ${isSelected ? "bg-[rgba(255,255,255,0.2)] text-[#faf7f2]" : "bg-[#f0efeb] text-[#9b9b9b]"}`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Main Content Area */}
            <div className="container mx-auto px-4 mt-8">

                {/* Loading */}
                {loading && <SkeletonGrid />}

                {/* Error */}
                {error && (
                    <div className="text-center py-20">
                        <p className="text-[#6b6b6b] mb-4 font-sans">Não foi possível carregar o cardápio.</p>
                        <button
                            onClick={fetchProducts}
                            className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-semibold font-sans hover:bg-primary/90 transition-colors"
                        >
                            <RefreshCw className="h-4 w-4" /> Tentar novamente
                        </button>
                    </div>
                )}

                {/* Empty */}
                {!loading && !error && totalDishes === 0 && (
                    <div className="py-20 text-center">
                        <p className="text-[#6b6b6b] font-sans text-lg">Nenhum produto encontrado.</p>
                    </div>
                )}

                {/* Products */}
                {!loading && !error && (
                    <div className="space-y-16">
                        {Object.entries(sortedSearchedCategories).map(([categoryName, products]) => {
                            if (!products || products.length === 0) return null;

                            return (
                                <motion.div key={categoryName} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                                    {/* Section Header */}
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="text-2xl">{categoryIcons[categoryName] || "📦"}</div>
                                        <h2 className="font-['DM_Serif_Display'] text-[32px] text-[#1a1a1a] whitespace-nowrap">
                                            {categoryName}
                                        </h2>
                                        <div className="flex-1 h-px bg-[#e8e8e4] max-w-full" />
                                        <span className="font-['DM_Sans'] text-[#9b9b9b] text-[13px] font-medium whitespace-nowrap hidden sm:block">
                                            {products.length} pratos
                                        </span>
                                    </div>

                                    <motion.div layout className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                        <AnimatePresence mode="popLayout">
                                            {products.map((product) => {
                                                const image = product.node.images.edges[0]?.node;
                                                const price = product.node.priceRange.minVariantPrice.amount;
                                                const tags: string[] = product.node.tags || [];
                                                const badge = getBadge(tags);

                                                return (
                                                    <motion.div
                                                        layout
                                                        initial={{ opacity: 0 }}
                                                        whileInView={{ opacity: 1 }}
                                                        viewport={{ once: true, margin: "50px" }}
                                                        transition={{ duration: 0.5, ease: "easeInOut" }}
                                                        key={product.node.id}
                                                        className="group flex flex-col h-full bg-white rounded-[20px] shadow-[0px_2px_16px_0px_rgba(0,0,0,0.07)] overflow-hidden transition-all duration-300 select-none"
                                                    >
                                                        <Link to={`/produto/${product.node.handle}`} className="relative aspect-square bg-[#f0efeb] overflow-hidden block">
                                                            <img
                                                                src={image?.url || "/placeholder.svg"}
                                                                alt={image?.altText || product.node.title}
                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                            />
                                                            {badge && (
                                                                <span className={`absolute top-3 left-3 text-xs font-semibold px-3 py-1.5 rounded-full font-sans shadow-sm ${badge.className}`}>
                                                                    {badge.label}
                                                                </span>
                                                            )}
                                                        </Link>

                                                        <div className="p-5 flex flex-col flex-1 bg-white">
                                                            <Link to={`/produto/${product.node.handle}`} className="hover:underline flex-col flex flex-1 block">
                                                                <h3 className="text-[14px] font-bold text-[#1a1a1a] mb-[4px] font-['DM_Sans'] leading-[18.2px]">
                                                                    {product.node.title}
                                                                </h3>
                                                                <p className="text-[12px] text-[#6b6b6b] font-['DM_Sans'] mb-[16px] line-clamp-2 min-h-[32px] leading-[18px]">
                                                                    {product.node.description}
                                                                </p>
                                                            </Link>

                                                            <div className="flex items-center gap-3 mb-4 mt-auto">
                                                                <span className="text-[16px] font-bold text-[#1a1a1a] font-['DM_Sans'] leading-[16px]">
                                                                    R$ {formatPrice(price)}
                                                                </span>
                                                            </div>

                                                            <button
                                                                disabled={isLoading}
                                                                onClick={(e) => { e.preventDefault(); handleAdd(product); }}
                                                                className="w-full bg-[#1e3a1e] text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-[#1e3a1e]/90 transition-all duration-300 font-sans text-[12px] tracking-[0.72px] disabled:opacity-50"
                                                            >
                                                                {isLoading ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <ShoppingBag className="w-4 h-4" />
                                                                        ADICIONAR
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </AnimatePresence>
                                    </motion.div>
                                </motion.div>
                            );
                        })}

                        {displayedCount === 0 && currentCategory !== "Todos" && (
                            <div className="py-20 text-center">
                                <p className="text-[#6b6b6b] font-sans text-lg">Nenhum prato encontrado para esta categoria.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
