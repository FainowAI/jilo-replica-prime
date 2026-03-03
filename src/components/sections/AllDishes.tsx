import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2, RefreshCw } from "lucide-react";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { Skeleton } from "@/components/ui/skeleton";

const CATEGORY_ORDER = ["Aves & Suínos", "Bovinos", "Peixes & Massas", "Veganos"];

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
    <>
      {CATEGORY_ORDER.map((cat) => (
        <div key={cat} className="mb-12 last:mb-0">
          <Skeleton className="h-7 w-40 mb-6" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden border">
                <Skeleton className="aspect-square w-full" />
                <div className="p-4 space-y-2">
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
    <section id="cardapio" className="py-16 lg:py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-2 font-sans">Cardápio Completo</p>
          <h2 className="text-3xl lg:text-4xl">Todos os Pratos</h2>
        </div>

        {loading && <SkeletonGrid />}

        {error && (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">Não foi possível carregar o cardápio. Tente novamente.</p>
            <button
              onClick={fetchProducts}
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-semibold font-sans hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && orderedCategories.length === 0 && (
          <p className="text-center text-muted-foreground py-16">Nenhum produto encontrado.</p>
        )}

        {!loading && !error && orderedCategories.map((category) => (
          <div key={category} className="mb-12 last:mb-0">
            <h3 className="text-xl lg:text-2xl mb-6 font-serif">{category}</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {grouped[category].map((product) => {
                const image = product.node.images.edges[0]?.node;
                const price = product.node.priceRange.minVariantPrice.amount;
                const tags: string[] = product.node.tags || [];
                const badge = getBadge(tags);

                return (
                  <div key={product.node.id} className="group bg-card rounded-2xl overflow-hidden border hover:shadow-lg transition-shadow">
                    <div className="aspect-square bg-muted relative overflow-hidden">
                      <img
                        src={image?.url || "/placeholder.svg"}
                        alt={image?.altText || product.node.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      {badge && (
                        <span className={`absolute top-3 left-3 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full font-sans ${badge.className}`}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <h4 className="font-sans font-semibold text-sm mb-1 line-clamp-2">{product.node.title}</h4>
                      <div className="flex items-center justify-between mt-2">
                        <p className="font-bold text-primary font-sans">R$ {formatPrice(price)}</p>
                        <button
                          disabled={isLoading}
                          onClick={() => handleAdd(product)}
                          className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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
    </section>
  );
};

export default AllDishes;
