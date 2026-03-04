import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { Skeleton } from "@/components/ui/skeleton";

function formatPrice(amount: string) {
  return parseFloat(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const Favorites = () => {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const addItem = useCartStore((s) => s.addItem);
  const isLoading = useCartStore((s) => s.isLoading);

  const fetchFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const data = await storefrontApiRequest(PRODUCTS_QUERY, { first: 4, query: "tag:mais-pedido" });
      const items: ShopifyProduct[] = data?.data?.products?.edges || [];

      // Fallback: if fewer than 4, fill with general products
      if (items.length < 4) {
        const fallback = await storefrontApiRequest(PRODUCTS_QUERY, { first: 8 });
        const all: ShopifyProduct[] = fallback?.data?.products?.edges || [];
        const ids = new Set(items.map((p) => p.node.id));
        for (const p of all) {
          if (!ids.has(p.node.id)) { items.push(p); ids.add(p.node.id); }
          if (items.length >= 4) break;
        }
      }

      setProducts(items.slice(0, 4));
    } catch {
      // silent fail – section simply won't render
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFavorites(); }, [fetchFavorites]);

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

  if (!loading && products.length === 0) return null;

  return (
    <section className="py-16 lg:py-20 bg-[#FAF7F2]">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center text-center mb-10 gap-1.5">
          <p className="text-[#d4a017] text-[12px] uppercase tracking-[1.2px] font-bold font-sans">
            DESTAQUES
          </p>
          <h2 className="text-[36px] text-[#1a1a1a] font-['DM_Serif_Display'] leading-tight">
            Os Favoritos da Galera
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-[20px] overflow-hidden bg-white shadow-[0px_2px_16px_0px_rgba(0,0,0,0.07)]">
                <Skeleton className="aspect-square w-full" />
                <div className="p-4 space-y-2 bg-[#FAF7F2]">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex justify-between items-center mt-4">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-9 w-9 rounded-full" />
                  </div>
                </div>
              </div>
            ))
            : products.map((product) => {
              const image = product.node.images.edges[0]?.node;
              const price = product.node.priceRange.minVariantPrice.amount;
              const tags = product.node.tags || [];
              const isVegan = tags.some((t) => t.toLowerCase() === "vegano");
              const badge = isVegan ? "🌱 Vegano" : "⭐ Mais pedido";
              const badgeClass = isVegan ? "bg-[#2d5016] text-white" : "bg-[#d4a017] text-[#1e3a1e]";

              return (
                <div key={product.node.id} className="group bg-white flex flex-col rounded-[20px] overflow-hidden shadow-[0px_2px_16px_0px_rgba(0,0,0,0.07)] hover:shadow-[0px_4px_24px_0px_rgba(0,0,0,0.1)] transition-shadow">
                  <Link to={`/produto/${product.node.handle}`} className="relative aspect-square bg-[#f3f4f6] overflow-hidden block">
                    <img
                      src={image?.url || "/placeholder.svg"}
                      alt={image?.altText || product.node.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <span className={`absolute top-[12px] left-[12px] text-[11px] font-bold font-sans px-[10px] py-[4px] rounded-[100px] ${badgeClass}`}>
                      {badge}
                    </span>
                  </Link>
                  <div className="bg-[#FAF7F2] p-4 flex flex-col flex-1 gap-3">
                    <Link to={`/produto/${product.node.handle}`} className="hover:underline flex-1 block">
                      <h3 className="font-sans font-semibold text-[14px] text-[#1a1a1a] leading-snug line-clamp-2">
                        {product.node.title}
                      </h3>
                    </Link>
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-[16px] text-[#1e3a1e] font-sans leading-none">
                        R$ {formatPrice(price)}
                      </p>
                      <button
                        disabled={isLoading}
                        onClick={(e) => { e.preventDefault(); handleAdd(product); }}
                        className="w-[36px] h-[36px] rounded-[18px] bg-[#1e3a1e] text-white flex items-center justify-center shadow-[0px_2px_8px_0px_rgba(30,58,30,0.3)] hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50"
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
    </section>
  );
};

export default Favorites;
