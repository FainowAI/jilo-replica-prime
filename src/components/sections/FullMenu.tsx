import { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ShoppingBag, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { Skeleton } from "@/components/ui/skeleton";

const CATEGORY_ORDER = ["Aves & Suínos", "Bovinos", "Peixes & Massas", "Veganos"];

const categoryIcons: Record<string, string> = {
    "Aves & Suínos": "🍗",
    "Bovinos": "🥩",
    "Peixes & Massas": "🐟",
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

    const displayedCount = Object.values(displayedCategories).reduce((acc, arr) => acc + arr.length, 0);

    const handleCategoryClick = (cat: string) => {
        if (cat === "Todos") {
            searchParams.delete("category");
            setSearchParams(searchParams);
        } else {
            setSearchParams({ category: cat });
        }
    };

    return (
        <div className="py-8 lg:py-12">
            <div className="container mx-auto px-4">

                {/* Breadcrumbs */}
                <div className="flex items-center gap-2 text-sm text-foreground mb-8">
                    <a href="/" className="hover:underline font-sans">Página Inicial</a>
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-semibold text-foreground font-sans cursor-default">Cardápio</span>
                </div>

                {/* Header */}
                <div className="mb-10">
                    <h1 className="text-4xl lg:text-[42px] font-sans text-secondary-foreground mb-6 font-[400] tracking-tight">
                        Cardápio
                    </h1>
                    {!loading && !error && (
                        <>
                            <p className="text-muted-foreground font-sans text-lg mb-2">
                                {totalDishes} pratos artesanais congelados. Prontos em minutos.
                            </p>
                            <p className="text-muted-foreground font-sans font-medium">
                                Exibindo {displayedCount} pratos.
                            </p>
                        </>
                    )}
                </div>

                {/* Filter Buttons */}
                {!loading && !error && (
                    <div className="flex overflow-x-auto gap-3 pb-4 mb-10 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                        {categories.map((cat) => {
                            const isSelected = currentCategory === cat;
                            const count = cat === "Todos" ? totalDishes : (grouped[cat]?.length || 0);

                            return (
                                <button
                                    key={cat}
                                    onClick={() => handleCategoryClick(cat)}
                                    className={`
                                        flex items-center gap-2 px-5 py-2.5 rounded-[12px] font-sans text-sm font-semibold transition-all whitespace-nowrap
                                        ${isSelected
                                            ? "bg-[#1F3328] text-white shadow-md cursor-default pointer-events-none"
                                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                        }
                                    `}
                                >
                                    <span>{cat}</span>
                                    <span className={`px-2 py-[2px] rounded-md text-xs font-bold leading-none ${isSelected ? "bg-white/20 text-white" : "bg-foreground/10 text-foreground"}`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Loading */}
                {loading && <SkeletonGrid />}

                {/* Error */}
                {error && (
                    <div className="text-center py-20">
                        <p className="text-muted-foreground mb-4 font-sans">Não foi possível carregar o cardápio.</p>
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
                        <p className="text-muted-foreground font-sans text-lg">Nenhum produto encontrado.</p>
                    </div>
                )}

                {/* Products */}
                {!loading && !error && (
                    <div className="space-y-16">
                        {Object.entries(displayedCategories).map(([categoryName, products]) => {
                            if (!products || products.length === 0) return null;

                            return (
                                <div key={categoryName}>
                                    {/* Section Header */}
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="text-2xl">{categoryIcons[categoryName] || "📦"}</div>
                                        <h2 className="text-2xl font-serif text-secondary-foreground whitespace-nowrap">
                                            {categoryName}
                                        </h2>
                                        <div className="flex-1 h-px bg-border max-w-full" />
                                        <span className="text-muted-foreground font-sans text-sm font-medium whitespace-nowrap hidden sm:block">
                                            {products.length} pratos
                                        </span>
                                    </div>

                                    {/* Grid */}
                                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                        {products.map((product) => {
                                            const image = product.node.images.edges[0]?.node;
                                            const price = product.node.priceRange.minVariantPrice.amount;
                                            const tags: string[] = product.node.tags || [];
                                            const badge = getBadge(tags);

                                            return (
                                                <div key={product.node.id} className="group flex flex-col h-full bg-background rounded-2xl overflow-hidden border border-border hover:shadow-md transition-all duration-300">
                                                    <Link to={`/produto/${product.node.handle}`} className="relative aspect-square bg-secondary overflow-hidden block">
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

                                                    <div className="p-5 flex flex-col flex-1">
                                                        <Link to={`/produto/${product.node.handle}`} className="hover:underline flex-col flex flex-1 block">
                                                            <h3 className="text-sm font-semibold text-secondary-foreground mb-1 font-sans leading-tight">
                                                                {product.node.title}
                                                            </h3>
                                                            <p className="text-xs text-muted-foreground font-sans mb-4 line-clamp-2 min-h-[32px]">
                                                                {product.node.description}
                                                            </p>
                                                        </Link>

                                                        <div className="flex items-center gap-3 mb-4 mt-auto">
                                                            <span className="text-lg font-bold text-secondary-foreground font-sans leading-none">
                                                                R$ {formatPrice(price)}
                                                            </span>
                                                        </div>

                                                        <button
                                                            disabled={isLoading}
                                                            onClick={(e) => { e.preventDefault(); handleAdd(product); }}
                                                            className="w-full bg-secondary/70 text-secondary-foreground font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 font-sans text-sm disabled:opacity-50"
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
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                        {displayedCount === 0 && currentCategory !== "Todos" && (
                            <div className="py-20 text-center">
                                <p className="text-muted-foreground font-sans text-lg">Nenhum prato encontrado para esta categoria.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
