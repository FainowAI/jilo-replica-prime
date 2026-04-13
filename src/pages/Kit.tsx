import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, ChevronRight, Loader2, Check } from "lucide-react";
import { motion } from "framer-motion";
import { storefrontApiRequest, COLLECTION_BY_HANDLE_QUERY, type ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";
import BenefitsSummary from "@/components/BenefitsSummary";
import FreeBadge from "@/components/FreeBadge";
import { toast } from "sonner";

const KIT_META: Record<string, { name: string; emoji: string; bgColor: string; positioning: string }> = {
  "kit-leveza": { name: "Kit Leveza", emoji: "🍗", bgColor: "#1e3a1e", positioning: "Sabor do dia a dia, leve e reconfortante" },
  "kit-sabor": { name: "Kit Sabor", emoji: "🐟", bgColor: "#6b4226", positioning: "Variedade e descoberta a cada refeição" },
  "kit-forca": { name: "Kit Força", emoji: "🥩", bgColor: "#2c3e50", positioning: "Proteína de alto valor para quem não abre mão" },
  "kit-verde": { name: "Kit Verde", emoji: "🌱", bgColor: "#4a5c2f", positioning: "Alimentação consciente sem abrir mão do sabor" },
};

const KIT_SIZES = [
  { qty: 7, discount: 10, label: "Kit de 7" },
  { qty: 14, discount: 15, label: "Kit de 14" },
  { qty: 21, discount: 20, label: "Kit de 21" },
  { qty: 28, discount: 25, label: "Kit de 28" },
];

function formatPrice(amount: number) {
  return amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Kit() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);
  const refreshCartDetails = useCartStore((s) => s.refreshCartDetails);
  const isLoading = useCartStore((s) => s.isLoading);

  const [selectedSize, setSelectedSize] = useState(0); // index into KIT_SIZES
  const [isAdding, setIsAdding] = useState(false);

  const meta = slug ? KIT_META[slug] : null;

  const { data: collectionData, isLoading: collectionLoading } = useQuery({
    queryKey: ["collection", slug],
    queryFn: async () => {
      const data = await storefrontApiRequest(COLLECTION_BY_HANDLE_QUERY, { handle: slug, first: 50 });
      return data?.data?.collectionByHandle;
    },
    enabled: !!slug && !!meta,
  });

  const products: ShopifyProduct[] = collectionData?.products?.edges || [];
  const kitSize = KIT_SIZES[selectedSize];

  // Estimated price calculation
  const totalBasePrice = products.reduce((sum, p) => sum + parseFloat(p.node.priceRange.minVariantPrice.amount), 0);
  const avgPrice = products.length > 0 ? totalBasePrice / products.length : 0;
  const estimatedBase = avgPrice * kitSize.qty;
  const estimatedDiscounted = estimatedBase * (1 - kitSize.discount / 100);

  const handleAddKit = async () => {
    if (products.length === 0) return;
    setIsAdding(true);

    try {
      // Distribute kitSize equally among products, remainder goes to first products
      const perProduct = Math.floor(kitSize.qty / products.length);
      const remainder = kitSize.qty % products.length;

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const variant = product.node.variants.edges[0]?.node;
        if (!variant || !variant.availableForSale) continue;

        const qty = perProduct + (i < remainder ? 1 : 0);
        if (qty <= 0) continue;

        await addItem({
          product,
          variantId: variant.id,
          variantTitle: variant.title,
          price: variant.price,
          quantity: qty,
          selectedOptions: variant.selectedOptions || [],
        });
      }

      await refreshCartDetails();
      toast.success(`${meta?.name || "Kit"} adicionado ao carrinho!`);
      navigate("/carrinho");
    } catch (error) {
      console.error("Failed to add kit:", error);
      toast.error("Erro ao adicionar kit. Tente novamente.");
    } finally {
      setIsAdding(false);
    }
  };

  // Invalid slug
  if (!meta) {
    return (
      <div className="min-h-screen bg-[#faf7f2]">
        <AnnouncementBar />
        <Header />
        <main className="container mx-auto px-4 py-16 text-center">
          <h1 className="font-['DM_Serif_Display'] text-3xl text-[#1a1a1a] mb-4">Kit não encontrado</h1>
          <p className="text-[#9b9b9b] mb-8 font-sans">O kit que você procura não existe.</p>
          <Link
            to="/#kits"
            className="inline-flex items-center gap-2 px-8 py-3 bg-[#1e3a1e] text-white rounded-[14px] text-sm font-bold hover:bg-[#1e3a1e]/90 transition-colors"
          >
            Ver kits disponíveis
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf7f2]">
      <AnnouncementBar />
      <Header />

      {/* Hero */}
      <div className="w-full" style={{ backgroundColor: meta.bgColor }}>
        <div className="container mx-auto px-4 py-12 lg:py-16 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/60 mb-8 font-sans">
            <Link to="/" className="hover:text-white/90 transition-colors">Página Inicial</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link to="/#kits" className="hover:text-white/90 transition-colors">Kits</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-white font-medium">{meta.name}</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <span className="text-4xl mb-4 block">{meta.emoji}</span>
              <h1 className="font-['DM_Serif_Display'] text-4xl lg:text-5xl text-white mb-3">
                {meta.name}
              </h1>
              <p className="text-lg text-white/70 font-sans max-w-lg">
                {meta.positioning}
              </p>
            </div>
            <FreeBadge size="md" className="bg-white/15 text-white self-start lg:self-auto" />
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 lg:py-12 max-w-6xl">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {/* Left — Products */}
          <div className="flex-1">
            {/* Size Selector */}
            <div className="mb-8">
              <h2 className="font-['DM_Serif_Display'] text-2xl text-[#1a1a1a] mb-4">
                Escolha o tamanho do kit
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {KIT_SIZES.map((size, idx) => {
                  const isSelected = idx === selectedSize;
                  return (
                    <button
                      key={size.qty}
                      onClick={() => setSelectedSize(idx)}
                      className={`relative flex flex-col items-center py-4 px-3 rounded-2xl border-2 transition-all font-sans ${
                        isSelected
                          ? "border-[#1e3a1e] bg-[#1e3a1e]/5 shadow-md"
                          : "border-[#e8e8e4] bg-white hover:border-[#1e3a1e]/30"
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute -top-2 -right-2 w-5 h-5 bg-[#1e3a1e] rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <span className="text-2xl font-bold text-[#1a1a1a]">{size.qty}</span>
                      <span className="text-xs text-[#9b9b9b] mt-0.5">pratos</span>
                      <span className="text-xs font-semibold text-[#1e3a1e] mt-1.5 bg-[#1e3a1e]/10 px-2 py-0.5 rounded-full">
                        -{size.discount}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Products Grid */}
            <h3 className="font-['DM_Serif_Display'] text-xl text-[#1a1a1a] mb-4">
              Pratos do {meta.name}
            </h3>

            {collectionLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-[#1e3a1e]" />
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-[#e8e8e4]">
                <p className="text-[#9b9b9b] font-sans">Nenhum prato encontrado para este kit.</p>
                <p className="text-xs text-[#9b9b9b] font-sans mt-2">A collection pode não ter sido criada no Shopify.</p>
              </div>
            ) : (
              <motion.div
                layout
                className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6"
              >
                {products.map((product, idx) => {
                  const image = product.node.images.edges[0]?.node;
                  const price = product.node.priceRange.minVariantPrice.amount;
                  const variant = product.node.variants.edges[0]?.node;
                  const compareAt = variant?.compareAtPrice?.amount;

                  return (
                    <motion.div
                      key={product.node.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.05 }}
                      className="group flex flex-col bg-white rounded-[20px] shadow-[0px_2px_16px_0px_rgba(0,0,0,0.05)] overflow-hidden"
                    >
                      <Link to={`/produto/${product.node.handle}`} className="relative aspect-square bg-[#f0efeb] overflow-hidden block">
                        <img
                          src={image?.url || "/placeholder.svg"}
                          alt={image?.altText || product.node.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </Link>
                      <div className="p-4 flex flex-col flex-1">
                        <Link to={`/produto/${product.node.handle}`} className="block flex-1">
                          <h4 className="text-[13px] font-bold text-[#1a1a1a] font-sans leading-[18px] mb-1 line-clamp-2">
                            {product.node.title}
                          </h4>
                          <p className="text-[11px] text-[#6b6b6b] font-sans line-clamp-2 mb-3">
                            {product.node.description}
                          </p>
                        </Link>
                        <div className="flex items-center gap-2 mt-auto">
                          {compareAt && parseFloat(compareAt) > parseFloat(price) && (
                            <span className="text-[11px] text-[#9b9b9b] line-through font-sans">
                              R$ {formatPrice(parseFloat(compareAt))}
                            </span>
                          )}
                          <span className="text-[15px] font-bold text-[#1a1a1a] font-sans">
                            R$ {formatPrice(parseFloat(price))}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>

          {/* Right — Sidebar Summary */}
          <div className="lg:w-[340px] flex-shrink-0">
            <div className="bg-white rounded-2xl border border-[#e8e8e4] p-6 lg:sticky lg:top-24">
              <h2 className="font-['DM_Serif_Display'] text-xl text-[#1a1a1a] mb-1">
                {meta.name}
              </h2>
              <p className="text-sm text-[#9b9b9b] font-sans mb-5">
                {kitSize.qty} pratos · {kitSize.discount}% de desconto
              </p>

              {/* Estimated Price */}
              {products.length > 0 && (
                <div className="bg-[#faf7f2] rounded-xl p-4 mb-5 border border-[#e8e8e4]/60">
                  <p className="text-xs text-[#9b9b9b] font-sans mb-2">Preço estimado</p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm text-[#9b9b9b] line-through font-sans">
                      R$ {formatPrice(estimatedBase)}
                    </span>
                    <span className="text-xs font-semibold text-[#1e3a1e] bg-[#1e3a1e]/10 px-2 py-0.5 rounded-full">
                      -{kitSize.discount}%
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-[#1a1a1a] font-sans">
                    ~R$ {formatPrice(estimatedDiscounted)}
                  </p>
                  <p className="text-[11px] text-[#9b9b9b] font-sans mt-2">
                    Desconto aplicado automaticamente no carrinho
                  </p>
                </div>
              )}

              <BenefitsSummary className="mb-5" />

              {/* Add Kit Button */}
              <button
                onClick={handleAddKit}
                disabled={isAdding || isLoading || products.length === 0}
                className="w-full h-14 bg-[#1e3a1e] text-white rounded-2xl font-bold text-sm font-sans shadow-[0px_4px_20px_0px_rgba(30,58,30,0.28)] hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isAdding ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <ShoppingBag className="w-5 h-5" />
                    Adicionar {kitSize.label} ao Carrinho
                  </>
                )}
              </button>

              <p className="text-center text-xs text-[#9b9b9b] font-sans mt-3">
                Pratos distribuídos igualmente no carrinho
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
