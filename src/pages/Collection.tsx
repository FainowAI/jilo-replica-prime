import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Plus, ArrowLeft, Loader2 } from "lucide-react";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { Skeleton } from "@/components/ui/skeleton";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";

const CATEGORIES = [
  { slug: "aves-suinos", productType: "Aves e Suinos", emoji: "🍗", label: "Aves & Suínos", price: "18,94" },
  { slug: "peixes-massas", productType: "Peixes e Massas", emoji: "🐟", label: "Peixes & Massas", price: "20,30" },
  { slug: "bovinos", productType: "Bovinos", emoji: "🥩", label: "Bovinos", price: "25,70" },
  { slug: "veganos", productType: "Veganos", emoji: "🌱", label: "Veganos", price: "25,70" },
] as const;

type Category = typeof CATEGORIES[number];

const TAG_BADGES: Record<string, { text: string; className: string }> = {
  "mais-pedido": { text: "⭐ Mais pedido", className: "bg-accent text-accent-foreground" },
  vegano: { text: "🌱 Vegano", className: "bg-secondary text-secondary-foreground" },
  "low-carb": { text: "Low Carb", className: "bg-muted text-muted-foreground" },
  novo: { text: "Novo", className: "bg-destructive/80 text-destructive-foreground" },
};

const formatPrice = (amount: string) =>
  parseFloat(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ProductCard = ({ product }: { product: ShopifyProduct }) => {
  const addItem = useCartStore((s) => s.addItem);
  const isLoading = useCartStore((s) => s.isLoading);
  const variant = product.node.variants.edges[0]?.node;
  const image = product.node.images.edges[0]?.node;
  const tags = product.node.tags || [];

  const handleAdd = async () => {
    if (!variant) return;
    await addItem({
      product,
      variantId: variant.id,
      variantTitle: variant.title,
      price: variant.price,
      quantity: 1,
      selectedOptions: variant.selectedOptions || [],
    });
  };

  return (
    <Link
      to={`/produto/${product.node.handle}`}
      className="group bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg transition-shadow flex flex-col"
    >
      <div className="aspect-square bg-muted relative overflow-hidden">
        {image ? (
          <img src={image.url} alt={image.altText || product.node.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-muted-foreground/30">🍽️</div>
        )}
        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {tags.map((tag) => {
            const badge = TAG_BADGES[tag];
            if (!badge) return null;
            return (
              <span key={tag} className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full font-sans ${badge.className}`}>
                {badge.text}
              </span>
            );
          })}
        </div>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-sans font-semibold text-foreground text-sm mb-1 line-clamp-2">{product.node.title}</h3>
        <p className="text-accent font-bold font-sans mt-auto">
          R$ {formatPrice(variant?.price.amount || "0")}
        </p>
      </div>
      <div className="px-4 pb-4">
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAdd(); }}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold font-sans hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Adicionar</>}
        </button>
      </div>
    </Link>
  );
};

const Collection = () => {
  const { categoria } = useParams<{ categoria: string }>();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const current = CATEGORIES.find((c) => c.slug === categoria);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    const fetchProducts = async () => {
      setLoading(true);
      setError(false);
      try {
        const data = await storefrontApiRequest(PRODUCTS_QUERY, {
          first: 20,
          query: `product_type:'${current.productType}'`,
        });
        if (!cancelled) setProducts(data?.data?.products?.edges || []);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProducts();
    return () => { cancelled = true; };
  }, [current]);

  if (!current) {
    navigate("/", { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero header */}
      <section className="bg-primary pt-28 pb-12 lg:pt-32 lg:pb-16">
        <div className="container mx-auto px-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-primary-foreground/60 text-sm font-sans mb-6 hover:text-primary-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl lg:text-5xl">{current.emoji}</span>
            <h1 className="text-3xl lg:text-4xl text-primary-foreground">{current.label}</h1>
          </div>
          <p className="text-primary-foreground/70 font-sans text-sm">
            {loading ? "Carregando pratos..." : `${products.length} prato${products.length !== 1 ? "s" : ""} · a partir de R$ ${current.price}/un`}
          </p>
        </div>
      </section>

      {/* Category pills */}
      <nav className="sticky top-0 z-30 bg-background border-b border-border">
        <div className="container mx-auto px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              to={`/colecao/${cat.slug}`}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold font-sans transition-colors ${
                cat.slug === categoria
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat.emoji} {cat.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Product grid */}
      <section className="py-10 lg:py-14">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden border border-border">
                  <Skeleton className="aspect-square w-full" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground font-sans mb-4">Erro ao carregar os pratos.</p>
              <button onClick={() => window.location.reload()} className="bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-sm font-semibold font-sans">
                Tentar novamente
              </button>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">🍽️</p>
              <p className="text-muted-foreground font-sans mb-4">Nenhum prato encontrado nesta categoria.</p>
              <Link to="/" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-sm font-semibold font-sans">
                Voltar ao início
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {products.map((p) => (
                <ProductCard key={p.node.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Collection;
