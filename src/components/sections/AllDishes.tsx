import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { Skeleton } from "@/components/ui/skeleton";

const CATEGORY_ORDER = ["Aves & Suínos", "Bovinos", "Peixes & Massas", "Veganos"];

const CATEGORY_LABELS: Record<string, string> = {
  "Aves & Suínos": "Aves & Suínos",
  "Bovinos": "Bovinos",
  "Peixes & Massas": "Peixes & Massas",
  "Veganos": "Veganos",
};

const CATEGORY_EMOJIS: Record<string, string> = {
  "Aves & Suínos": "🍗",
  "Bovinos": "🥩",
  "Peixes & Massas": "🐟",
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
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const AllDishes = () => {
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

  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

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

          <div className="flex flex-wrap gap-2 lg:gap-3 justify-start">
            <span className="bg-[#d4a017] text-[#1e3a1e] rounded-[100px] px-[10px] py-[4px] text-[11px] font-bold font-sans uppercase tracking-tight cursor-pointer">⭐ Mais pedido</span>
            <span className="bg-[#2d5016] text-white rounded-[100px] px-[10px] py-[4px] text-[11px] font-bold font-sans uppercase tracking-tight cursor-pointer">🌱 Vegano</span>
            <span className="bg-[#4a6080] text-white rounded-[100px] px-[10px] py-[4px] text-[11px] font-bold font-sans uppercase tracking-tight cursor-pointer">Low Carb</span>
            <span className="bg-[#d4a017] text-[#1e3a1e] rounded-[100px] px-[10px] py-[4px] text-[11px] font-bold font-sans uppercase tracking-tight cursor-pointer">Novo</span>
          </div>
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
                {grouped[category].map((product) => {
                  const image = product.node.images.edges[0]?.node;
                  const price = product.node.priceRange.minVariantPrice.amount;
                  const tags: string[] = product.node.tags || [];
                  const badge = getBadge(tags);

                  return (
                    <div key={product.node.id} className="group bg-white flex flex-col rounded-[20px] shadow-[0px_2px_16px_0px_rgba(0,0,0,0.07)] overflow-hidden transition-shadow select-none">

                      {/* Image Container */}
                      <Link to={`/produto/${product.node.handle}`} className="relative aspect-square bg-[#f3f4f6] overflow-hidden block rounded-t-[16px] shrink-0">
                        <img
                          src={image?.url || "/placeholder.svg"}
                          alt={image?.altText || product.node.title}
                          className="w-full h-full object-cover pointer-events-none group-hover:scale-105 transition-transform duration-500"
                        />
                        {badge && (
                          <span className={`absolute top-[12px] left-[12px] text-[11px] font-bold font-sans uppercase px-[10px] py-[4px] rounded-[100px] leading-[11px] ${badge.className}`}>
                            {badge.label}
                          </span>
                        )}
                      </Link>

                      {/* Content Area */}
                      <div className="bg-[#faf7f2] pt-[12px] pb-[16px] px-[16px] flex flex-col gap-[12px] flex-1">
                        <Link to={`/produto/${product.node.handle}`} className="hover:underline flex-1 block">
                          <h4 className="font-sans font-semibold text-[14px] leading-[19.25px] text-[#1a1a1a] line-clamp-2">
                            {product.node.title}
                          </h4>
                        </Link>

                        <div className="flex items-center justify-between h-[36px]">
                          <p className="font-bold text-[#1e3a1e] font-sans text-[16px] leading-[24px] whitespace-nowrap">
                            R$ {formatPrice(price)}
                          </p>
                          <button
                            disabled={isLoading}
                            onClick={(e) => { e.preventDefault(); handleAdd(product); }}
                            className="shrink-0 w-[36px] h-[36px] rounded-[18px] bg-[#1e3a1e] text-white flex items-center justify-center shadow-[0px_2px_8px_0px_rgba(30,58,30,0.3)] hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
                            aria-label="Adicionar ao carrinho"
                          >
                            {isLoading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <PlusIcon />}
                          </button>
                        </div>
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
