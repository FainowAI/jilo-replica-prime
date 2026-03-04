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
      let items: ShopifyProduct[] = data?.data?.products?.edges || [];

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
    <section className="py-16 lg:py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-2 font-sans">Destaques</p>
          <h2 className="text-3xl lg:text-4xl">Os Favoritos da Galera</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden border">
                <Skeleton className="aspect-square w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
              </div>
            ))
            : products.map((product) => {
              const image = product.node.images.edges[0]?.node;
              const price = product.node.priceRange.minVariantPrice.amount;
              const tags = product.node.tags || [];
              const isVegan = tags.some((t) => t.toLowerCase() === "vegano");
              const badge = isVegan ? "🌱 Vegano" : "⭐ Mais pedido";
              const badgeClass = isVegan ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800";

              return (
                <div key={product.node.id} className="group bg-card flex flex-col rounded-2xl overflow-hidden border hover:shadow-lg transition-shadow">
                  <Link to={`/produto/${product.node.handle}`} className="relative aspect-square bg-muted overflow-hidden block">
                    <img
                      src={image?.url || "/placeholder.svg"}
                      alt={image?.altText || product.node.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <span className={`absolute top-3 left-3 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full font-sans ${badgeClass}`}>
                      {badge}
                    </span>
                  </Link>
                  <div className="p-4 flex flex-col flex-1">
                    <Link to={`/produto/${product.node.handle}`} className="hover:underline flex-1 block">
                      <h3 className="font-sans font-semibold text-sm mb-1 line-clamp-2">{product.node.title}</h3>
                    </Link>
                    <div className="flex items-center justify-between mt-2">
                      <p className="font-bold text-primary font-sans">R$ {formatPrice(price)}</p>
                      <button
                        disabled={isLoading}
                        onClick={(e) => { e.preventDefault(); handleAdd(product); }}
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
    </section>
  );
};

export default Favorites;
