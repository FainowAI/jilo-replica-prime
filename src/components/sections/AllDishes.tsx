import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { Skeleton } from "@/components/ui/skeleton";

const CATEGORY_ORDER = ["Aves e Suinos", "Bovinos", "Peixes e Massas", "Veganos"];

const CATEGORY_LABELS: Record<string, string> = {
  "Aves e Suinos": "Aves & Suínos",
  "Bovinos": "Bovinos",
  "Peixes e Massas": "Peixes & Massas",
  "Veganos": "Veganos",
};

const CATEGORY_EMOJIS: Record<string, string> = {
  "Aves e Suinos": "🍗",
  "Bovinos": "🥩",
  "Peixes e Massas": "🐟",
  "Veganos": "🌱",
};

const TAG_BADGES: Record<string, { label: string; className: string }> = {
  "mais-pedido": { label: "⭐ Mais pedido", className: "bg-[#d4a017] text-[#1e3a1e]" },
  "vegano": { label: "🌱 Vegano", className: "bg-[#2d5016] text-[#ffffff]" },
  "low-carb": { label: "Low Carb", className: "bg-[#4a6080] text-[#ffffff]" },
  "novo": { label: "Novo", className: "bg-[#d4a017] text-[#1e3a1e]" },
};

function getBadge(tags: string[]) {
  for (const tag of tags) {
    const normalized = tag.toLowerCase().trim();
    // Also support checking partial matches like "mais pedido" vs "mais-pedido"
    const matchKey = Object.keys(TAG_BADGES).find(k => normalized.includes(k.replace('-', ' ')));
    if (TAG_BADGES[normalized] || (matchKey && TAG_BADGES[matchKey])) {
      return TAG_BADGES[normalized] || TAG_BADGES[matchKey!];
    }
  }
  return null;
}

function formatPrice(amount: string) {
  return parseFloat(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SkeletonGrid() {
  return (
    <>
      {CATEGORY_ORDER.map((cat) => (
        <div key={cat} className="mb-14 last:mb-0 w-full max-w-[960px]">
          <div className="flex gap-[16px] items-center h-[24px] mb-8">
            <div className="flex gap-[10px] items-center">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-6 w-32" />
            </div>
            <div className="bg-[#2d5016] opacity-25 h-px flex-1" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-[20px] shadow-[0px_2px_16px_0px_rgba(0,0,0,0.07)] overflow-hidden">
                <Skeleton className="aspect-square w-full rounded-t-[16px]" />
                <div className="bg-[#faf7f2] p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const AllDishes = () => {
  const [grouped, setGrouped] = useState<Record<string, ShopifyProduct[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const searchFilter = searchParams.get("search")?.toLowerCase() || "";

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

  // Filter products by selected tag
  const filteredGrouped = Object.fromEntries(
    Object.entries(grouped)
      .map(([cat, products]) => [
        cat,
        products.filter((p) => {
          const matchTag = selectedTag ? p.node.tags.some((t) => t.toLowerCase().includes(selectedTag.toLowerCase())) : true;
          const matchSearch = searchFilter ? p.node.title.toLowerCase().includes(searchFilter) || cat.toLowerCase().includes(searchFilter) : true;
          return matchTag && matchSearch;
        }),
      ])
      .filter(([_, products]) => products.length > 0)
  );

  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => filteredGrouped[c]),
    ...Object.keys(filteredGrouped).filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  const handleTagClick = (tag: string) => {
    setSelectedTag(selectedTag === tag ? null : tag);
  };

  return (
    <section id="cardapio" className="pt-[64px] pb-16 lg:pb-24 bg-[#faf7f2]">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col items-center">

        {/* Header Section */}
        <div className="w-full max-w-[960px] flex flex-col items-start mb-[56px]">
          <h2 className="text-[32px] lg:text-[40px] text-[#1a1a1a] font-['DM_Serif_Display'] leadingtight lg:leading-[42px] mb-2">
            Todos os Pratos
          </h2>
          <p className="text-[16px] text-[#6b6b6b] font-sans font-normal leading-[24px] mb-8">
            24 opções artesanais para montar sua semana.
          </p>

          <div className="flex flex-wrap gap-2 lg:gap-3 justify-start mb-4">
            <button
              onClick={() => handleTagClick('mais-pedido')}
              className={`bg-[#d4a017] text-[#1e3a1e] rounded-[100px] px-[10px] py-[4px] text-[11px] font-bold font-sans uppercase tracking-tight cursor-pointer transition-all ${selectedTag === 'mais-pedido' ? 'ring-2 ring-[#d4a017] ring-offset-2' : 'hover:opacity-80'}`}
            >
              ⭐ Mais pedido
            </button>
            <button
              onClick={() => handleTagClick('vegano')}
              className={`bg-[#2d5016] text-white rounded-[100px] px-[10px] py-[4px] text-[11px] font-bold font-sans uppercase tracking-tight cursor-pointer transition-all ${selectedTag === 'vegano' ? 'ring-2 ring-[#2d5016] ring-offset-2' : 'hover:opacity-80'}`}
            >
              🌱 Vegano
            </button>
            <button
              onClick={() => handleTagClick('low-carb')}
              className={`bg-[#4a6080] text-white rounded-[100px] px-[10px] py-[4px] text-[11px] font-bold font-sans uppercase tracking-tight cursor-pointer transition-all ${selectedTag === 'low-carb' ? 'ring-2 ring-[#4a6080] ring-offset-2' : 'hover:opacity-80'}`}
            >
              Low Carb
            </button>
            <button
              onClick={() => handleTagClick('novo')}
              className={`bg-[#d4a017] text-[#1e3a1e] rounded-[100px] px-[10px] py-[4px] text-[11px] font-bold font-sans uppercase tracking-tight cursor-pointer transition-all ${selectedTag === 'novo' ? 'ring-2 ring-[#d4a017] ring-offset-2' : 'hover:opacity-80'}`}
            >
              Novo
            </button>
            {selectedTag && (
              <button
                onClick={() => setSelectedTag(null)}
                className="bg-gray-200 text-gray-700 rounded-[100px] px-[10px] py-[4px] text-[11px] font-bold font-sans uppercase tracking-tight cursor-pointer hover:bg-gray-300 transition-all"
              >
                ✕ Limpar filtros
              </button>
            )}
          </div>

          {searchFilter && (
            <div className="w-full flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-black/5 mt-4">
              <p className="text-[#1a1a1a] font-sans text-[15px]">
                Mostrando resultados para: <span className="font-bold">"{searchFilter}"</span>
              </p>
              <Link to="/cardapio" className="text-[14px] font-bold text-[#1e3a1e] hover:underline">
                Limpar busca
              </Link>
            </div>
          )}
        </div>

        {loading && <SkeletonGrid />}

        {error && (
          <div className="text-center py-16 w-full max-w-[960px]">
            <p className="text-muted-foreground mb-4 font-sans">Não foi possível carregar o cardápio. Tente novamente.</p>
            <button
              onClick={fetchProducts}
              className="inline-flex items-center gap-2 rounded-[100px] bg-[#1e3a1e] text-white px-6 py-3 text-sm font-bold font-sans hover:bg-[#1e3a1e]/90 transition-colors"
            >
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && orderedCategories.length === 0 && (
          <p className="text-center text-muted-foreground py-16 w-full max-w-[960px] font-sans">Nenhum produto encontrado.</p>
        )}

        {/* Categories Loop */}
        <div className="w-full max-w-[960px] flex flex-col gap-[56px] items-start">
          {!loading && !error && orderedCategories.map((category) => (
            <div key={category} className="w-full">

              {/* Category Header */}
              <div className="flex gap-[16px] items-center h-[24px] mb-8 w-full">
                <div className="flex gap-[10px] items-center shrink-0">
                  <span className="text-[22px] font-sans leading-[22px] -mt-[1px]">{CATEGORY_EMOJIS[category] || "🍽️"}</span>
                  <h3 className="text-[24px] text-[#1e3a1e] font-['DM_Serif_Display'] leading-[24px] whitespace-nowrap">
                    {CATEGORY_LABELS[category] || category}
                  </h3>
                </div>
                <div className="bg-[#2d5016] opacity-25 h-px flex-1 min-w-4" />
              </div>

              {/* Product Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-[20px]">
                {filteredGrouped[category].map((product) => {
                  const image = product.node.images.edges[0]?.node;
                  const price = product.node.priceRange.minVariantPrice.amount;
                  const tags: string[] = product.node.tags || [];
                  const badge = getBadge(tags);

                  const regularPrice = parseFloat(price);
                  const pixPrice = regularPrice * 0.95; // 5% desconto no PIX
                  const description = product.node.description || '';

                  return (
                    <div key={product.node.id} className="group bg-white flex flex-col rounded-[18px] shadow-[0px_2px_12px_0px_rgba(0,0,0,0.06)] overflow-hidden hover:shadow-lg transition-shadow select-none">

                      {/* Image Container */}
                      <Link to={`/produto/${product.node.handle}`} className="relative aspect-square bg-[#f0efeb] overflow-hidden block shrink-0">
                        <img
                          src={image?.url || "/placeholder.svg"}
                          alt={image?.altText || product.node.title}
                          className="w-full h-full object-cover pointer-events-none group-hover:scale-105 transition-transform duration-500"
                        />
                        {badge && (
                          <span className={`absolute top-[10px] left-[10px] text-[10px] font-bold font-sans px-[10px] py-[4px] rounded-[100px] ${badge.className}`}>
                            {badge.label}
                          </span>
                        )}
                      </Link>

                      {/* Content Area */}
                      <div className="bg-white pt-[13px] pb-[14px] px-[14px] flex flex-col flex-1">
                        {/* Title */}
                        <Link to={`/produto/${product.node.handle}`} className="hover:underline block mb-[6px]">
                          <h4 className="font-sans font-semibold text-[13px] leading-[17.55px] text-[#1a1a1a] line-clamp-2 min-h-[35px]">
                            {product.node.title}
                          </h4>
                        </Link>

                        {/* Description */}
                        <p className="font-sans text-[11px] leading-[14.3px] text-[#9b9b9b] line-clamp-2 mb-[8px] min-h-[28px]">
                          {description}
                        </p>

                        {/* Price Section */}
                        <div className="flex items-center gap-[6px] mb-[12px]">
                          <span className="font-sans text-[11px] leading-[11px] text-[#b8b5b0] line-through">
                            R$ {formatPrice(price)}
                          </span>
                          <span className="font-sans font-bold text-[15px] leading-[15px] text-[#1e3a1e]">
                            R$ {pixPrice.toFixed(2).replace('.', ',')}
                          </span>
                          <span className="bg-[rgba(212,160,23,0.1)] text-[#d4a017] text-[10px] font-semibold font-sans px-[6px] py-[2px] rounded-[100px] leading-[14px]">
                            PIX
                          </span>
                        </div>

                        {/* Add Button */}
                        <button
                          disabled={isLoading}
                          onClick={(e) => { e.preventDefault(); handleAdd(product); }}
                          className="w-full h-[38px] rounded-[10px] bg-[#1e3a1e] text-white flex items-center justify-center gap-[8px] hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 font-sans font-bold text-[12px] tracking-[0.72px]"
                          aria-label="Adicionar ao carrinho"
                        >
                          {isLoading ? (
                            <Loader2 className="h-[13px] w-[13px] animate-spin" />
                          ) : (
                            <>
                              <PlusIcon />
                              <span>ADICIONAR</span>
                            </>
                          )}
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AllDishes;
