import { useState, useCallback, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, ChevronRight, Loader2, Minus, Plus, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { storefrontApiRequest, PRODUCTS_QUERY, excludeInternalShipping, type ShopifyProduct } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";
import BenefitsSummary from "@/components/BenefitsSummary";
import FreeBadge from "@/components/FreeBadge";
import PixCallout from "@/components/PixCallout";
import SEO from "@/components/SEO";
import { KIT_STEP, getKitQuantityGuidance } from "@/config/kitQuantity";
import { toast } from "sonner";

const CATEGORY_ORDER = ["Aves e Suinos", "Bovinos", "Peixes e Massas", "Veganos"];
const CATEGORY_ICONS: Record<string, string> = {
  "Aves e Suinos": "🍗",
  "Bovinos": "🥩",
  "Peixes e Massas": "🐟",
  "Veganos": "🌱",
};

const KIT_TIERS = [
  { qty: 7, discount: 5 },
  { qty: 14, discount: 10 },
  { qty: 21, discount: 15 },
  { qty: 28, discount: 20 },
];

function getDiscountForQty(qty: number) {
  for (let i = KIT_TIERS.length - 1; i >= 0; i--) {
    if (qty >= KIT_TIERS[i].qty) return KIT_TIERS[i].discount;
  }
  return 0;
}

function formatPrice(amount: number) {
  return amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type SelectedItem = { product: ShopifyProduct; quantity: number };

export default function KitLivre() {
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);
  const refreshCartDetails = useCartStore((s) => s.refreshCartDetails);
  const cartIsLoading = useCartStore((s) => s.isLoading);

  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [isAdding, setIsAdding] = useState(false);
  const [showMobileSummary, setShowMobileSummary] = useState(false);

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["all-products-kit-livre"],
    queryFn: async () => {
      const data = await storefrontApiRequest(PRODUCTS_QUERY, { first: 50, query: excludeInternalShipping() });
      return (data?.data?.products?.edges || []) as ShopifyProduct[];
    },
  });

  const products = productsData || [];

  // Group products by category
  const grouped: Record<string, ShopifyProduct[]> = {};
  for (const product of products) {
    const type = product.node.productType || "Outros";
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(product);
  }

  const allCategories = [
    ...CATEGORY_ORDER.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  const displayCategories = activeCategory === "Todos" ? allCategories : [activeCategory];

  // Selection state
  const totalSelected = Array.from(selectedItems.values()).reduce((sum, item) => sum + item.quantity, 0);
  const isValidKit = totalSelected >= KIT_STEP && totalSelected % KIT_STEP === 0;
  const discount = getDiscountForQty(totalSelected);
  const guidance = getKitQuantityGuidance(totalSelected);
  // quando já é múltiplo válido, não há "faltando"; senão, faltam guidance.toAdd
  const remaining = isValidKit ? 0 : guidance.toAdd;
  const nextTargetQty = totalSelected === 0 ? KIT_STEP : guidance.nextMultiple;

  // Estimated prices
  const estimatedBase = Array.from(selectedItems.values()).reduce(
    (sum, item) => sum + parseFloat(item.product.node.priceRange.minVariantPrice.amount) * item.quantity,
    0
  );
  const estimatedDiscounted = estimatedBase * (1 - discount / 100);

  // Progress bar
  const progressTarget = nextTargetQty;
  const progressPct = isValidKit ? 100 : Math.min(100, (totalSelected / progressTarget) * 100);

  const updateQuantity = useCallback((variantId: string, product: ShopifyProduct, delta: number) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const existing = next.get(variantId);
      const currentQty = existing?.quantity || 0;
      const newQty = Math.max(0, currentQty + delta);

      if (newQty === 0) {
        next.delete(variantId);
      } else {
        next.set(variantId, { product, quantity: newQty });
      }

      return next;
    });
  }, []);

  const handleAddKit = async () => {
    if (!isValidKit) return;
    setIsAdding(true);

    try {
      for (const [variantId, item] of selectedItems) {
        const variant = item.product.node.variants.edges[0]?.node;
        if (!variant) continue;

        await addItem({
          product: item.product,
          variantId: variant.id,
          variantTitle: variant.title,
          price: variant.price,
          quantity: item.quantity,
          selectedOptions: variant.selectedOptions || [],
        });
      }

      await refreshCartDetails();
      toast.success(`Kit Livre de ${totalSelected} pratos adicionado!`);
      setSelectedItems(new Map());
      navigate("/carrinho");
    } catch (error) {
      console.error("Failed to add kit:", error);
      toast.error("Erro ao adicionar kit. Tente novamente.");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf7f2]">
      <SEO
        title="Kit Livre | Monte seu kit Jilo da semana"
        description="Monte seu Kit Livre Jilo escolhendo pratos de qualquer categoria. A partir de 7, sempre em múltiplos de 7. Descontos progressivos até 20%."
        path="/kit-livre"
      />
      <AnnouncementBar />
      <Header />

      {/* Hero */}
      <div className="w-full bg-[#d4a017]">
        <div className="container mx-auto px-4 py-8 lg:py-14 max-w-6xl">
          <nav className="flex items-center gap-1.5 text-sm text-[#1e3a1e]/60 mb-5 lg:mb-6 font-sans">
            <Link to="/" className="hover:text-[#1e3a1e] transition-colors">Página Inicial</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link to="/#kits" className="hover:text-[#1e3a1e] transition-colors">Kits</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-[#1e3a1e] font-medium">Kit Livre</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <span className="text-3xl lg:text-4xl mb-2 lg:mb-3 block">🍱</span>
              <h1 className="font-['DM_Serif_Display'] text-3xl lg:text-5xl text-[#1e3a1e] mb-2">
                Monte seu Kit da Semana
              </h1>
              <p className="text-sm lg:text-base text-[#1e3a1e]/70 font-sans max-w-lg">
                Escolha seus pratos favoritos de qualquer categoria. A partir de 7, sempre em múltiplos de 7.
              </p>
            </div>
            <FreeBadge size="md" className="bg-[#1e3a1e]/15 text-[#1e3a1e] self-start lg:self-auto" />
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 lg:py-12 max-w-6xl">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {/* Left — Products */}
          <div className="flex-1 min-w-0">
            {/* Category Filters */}
            <div className="flex flex-wrap gap-2 mb-8">
              {["Todos", ...allCategories].map((cat) => {
                const isSelected = activeCategory === cat;
                const count = cat === "Todos" ? products.length : (grouped[cat]?.length || 0);
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`flex items-center gap-1.5 h-[34px] rounded-full px-4 transition-all border font-sans text-[13px] font-semibold ${
                      isSelected
                        ? "bg-[#1e3a1e] text-white border-[#1e3a1e]"
                        : "bg-white border-[#e8e8e4] text-[#1a1a1a] hover:border-[#1e3a1e]/30"
                    }`}
                  >
                    {CATEGORY_ICONS[cat] && <span>{CATEGORY_ICONS[cat]}</span>}
                    {cat}
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                      isSelected ? "bg-white/20 text-white" : "bg-[#f0efeb] text-[#9b9b9b]"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Products */}
            {productsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-[#1e3a1e]" />
              </div>
            ) : (
              <div className="space-y-12">
                {displayCategories.map((categoryName) => {
                  const catProducts = grouped[categoryName];
                  if (!catProducts || catProducts.length === 0) return null;

                  return (
                    <div key={categoryName}>
                      <div className="flex items-center gap-3 mb-5">
                        <span className="text-xl">{CATEGORY_ICONS[categoryName] || "📦"}</span>
                        <h2 className="font-['DM_Serif_Display'] text-2xl text-[#1a1a1a]">{categoryName}</h2>
                        <div className="flex-1 h-px bg-[#e8e8e4]" />
                        <span className="text-[13px] text-[#9b9b9b] font-sans">{catProducts.length} pratos</span>
                      </div>

                      <motion.div layout className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        <AnimatePresence mode="popLayout">
                          {catProducts.map((product) => {
                            const image = product.node.images.edges[0]?.node;
                            const price = product.node.priceRange.minVariantPrice.amount;
                            const variantId = product.node.variants.edges[0]?.node?.id;
                            if (!variantId) return null;
                            const selectedQty = selectedItems.get(variantId)?.quantity || 0;

                            return (
                              <motion.div
                                key={product.node.id}
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className={`group flex flex-col bg-white rounded-[20px] shadow-[0px_2px_12px_0px_rgba(0,0,0,0.05)] overflow-hidden transition-all ${
                                  selectedQty > 0 ? "ring-2 ring-[#1e3a1e] ring-offset-2" : ""
                                }`}
                              >
                                <Link to={`/produto/${product.node.handle}`} className="relative aspect-square bg-[#f0efeb] overflow-hidden block">
                                  <img
                                    src={image?.url || "/placeholder.svg"}
                                    alt={image?.altText || product.node.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                  />
                                  {selectedQty > 0 && (
                                    <div className="absolute top-2 right-2 w-7 h-7 bg-[#1e3a1e] rounded-full flex items-center justify-center shadow-md">
                                      <span className="text-white text-xs font-bold">{selectedQty}</span>
                                    </div>
                                  )}
                                </Link>

                                <div className="p-4 flex flex-col flex-1">
                                  <h4 className="text-[13px] font-bold text-[#1a1a1a] font-sans leading-[18px] mb-1 line-clamp-2">
                                    {product.node.title}
                                  </h4>
                                  <p className="text-[15px] font-bold text-[#1a1a1a] font-sans mb-3 mt-auto">
                                    R$ {formatPrice(parseFloat(price))}
                                  </p>

                                  {selectedQty === 0 ? (
                                    <button
                                      onClick={() => updateQuantity(variantId, product, 1)}
                                      className="w-full py-2.5 bg-[#1e3a1e] text-white rounded-xl text-xs font-bold font-sans hover:bg-[#1e3a1e]/90 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      Adicionar
                                    </button>
                                  ) : (
                                    <div className="flex items-center justify-between bg-[#1e3a1e]/5 rounded-xl px-1 py-1">
                                      <button
                                        onClick={() => updateQuantity(variantId, product, -1)}
                                        aria-label={selectedQty === 1 ? `Remover ${product.node.title}` : `Diminuir quantidade de ${product.node.title}`}
                                        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white transition-colors"
                                      >
                                        {selectedQty === 1 ? (
                                          <X className="w-3.5 h-3.5 text-[#1e3a1e]" />
                                        ) : (
                                          <Minus className="w-3.5 h-3.5 text-[#1e3a1e]" />
                                        )}
                                      </button>
                                      <span className="text-sm font-bold text-[#1e3a1e] font-sans">{selectedQty}</span>
                                      <button
                                        onClick={() => updateQuantity(variantId, product, 1)}
                                        aria-label={`Aumentar quantidade de ${product.node.title}`}
                                        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white transition-colors disabled:opacity-40"
                                      >
                                        <Plus className="w-3.5 h-3.5 text-[#1e3a1e]" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right — Desktop Sidebar */}
          <div className="hidden lg:block lg:w-[340px] flex-shrink-0">
            <SidebarContent
              totalSelected={totalSelected}
              isValidKit={isValidKit}
              discount={discount}
              remaining={remaining}
              nextTargetQty={nextTargetQty}
              progressPct={progressPct}
              progressTarget={progressTarget}
              estimatedBase={estimatedBase}
              estimatedDiscounted={estimatedDiscounted}
              selectedItems={selectedItems}
              isAdding={isAdding}
              cartIsLoading={cartIsLoading}
              onAddKit={handleAddKit}
              onRemoveItem={(variantId, product) => updateQuantity(variantId, product, -1)}
            />
          </div>
        </div>
      </main>

      {/* Mobile Bottom Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e8e8e4] z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        {/* Drag handle */}
        <button
          onClick={() => setShowMobileSummary(!showMobileSummary)}
          aria-label={showMobileSummary ? "Recolher resumo do kit" : "Expandir resumo do kit"}
          className="flex justify-center w-full py-2"
        >
          <div className="w-10 h-1 bg-[#e8e8e4] rounded-full" />
        </button>

        {showMobileSummary && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-[45vh] overflow-y-auto px-4 pb-3">
            <SidebarContent
              totalSelected={totalSelected}
              isValidKit={isValidKit}
              discount={discount}
              remaining={remaining}
              nextTargetQty={nextTargetQty}
              progressPct={progressPct}
              progressTarget={progressTarget}
              estimatedBase={estimatedBase}
              estimatedDiscounted={estimatedDiscounted}
              selectedItems={selectedItems}
              isAdding={isAdding}
              cartIsLoading={cartIsLoading}
              onAddKit={handleAddKit}
              onRemoveItem={(variantId, product) => updateQuantity(variantId, product, -1)}
              compact
            />
            </div>
          </motion.div>
        )}

        <div className="flex items-center gap-3 px-4 pb-3">
          <button
            onClick={() => setShowMobileSummary(!showMobileSummary)}
            className="flex items-center gap-2 px-4 py-3 bg-[#f0efeb] rounded-xl text-sm font-sans font-semibold text-[#1a1a1a] flex-shrink-0"
          >
            <ShoppingBag className="w-4 h-4" />
            {totalSelected}
            {showMobileSummary ? <ChevronRight className="w-3 h-3 rotate-90" /> : <ChevronRight className="w-3 h-3 -rotate-90" />}
          </button>

          <button
            onClick={handleAddKit}
            disabled={!isValidKit || isAdding || cartIsLoading}
            className="flex-1 h-12 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isAdding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isValidKit ? (
              `Adicionar Kit de ${totalSelected}`
            ) : totalSelected === 0 ? (
              "Selecione pratos"
            ) : (
              `+${remaining} para completar`
            )}
          </button>
        </div>
      </div>

      {/* Spacer for mobile bottom bar */}
      <div className="lg:hidden h-[140px]" />

      <Footer />
    </div>
  );
}

// Sidebar / Summary component
function SidebarContent({
  totalSelected,
  isValidKit,
  discount,
  remaining,
  nextTargetQty,
  progressPct,
  progressTarget,
  estimatedBase,
  estimatedDiscounted,
  selectedItems,
  isAdding,
  cartIsLoading,
  onAddKit,
  onRemoveItem,
  compact = false,
}: {
  totalSelected: number;
  isValidKit: boolean;
  discount: number;
  remaining: number;
  nextTargetQty: number;
  progressPct: number;
  progressTarget: number;
  estimatedBase: number;
  estimatedDiscounted: number;
  selectedItems: Map<string, SelectedItem>;
  isAdding: boolean;
  cartIsLoading: boolean;
  onAddKit: () => void;
  onRemoveItem: (variantId: string, product: ShopifyProduct) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "bg-white rounded-2xl border border-[#e8e8e4] p-6 lg:sticky lg:top-24"}>
      <h2 className={`font-['DM_Serif_Display'] text-[#1a1a1a] ${compact ? "text-lg mb-3" : "text-xl mb-1"}`}>
        Kit Livre
      </h2>

      {/* Counter + Progress */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-sm font-sans text-[#1a1a1a]">
            <span className="font-bold">{totalSelected}</span> de <span className="font-bold">{progressTarget}</span> pratos
          </p>
          {discount > 0 && (
            <span className="text-xs font-semibold text-[#1e3a1e] bg-[#1e3a1e]/10 px-2 py-0.5 rounded-full">
              -{discount}%
            </span>
          )}
        </div>
        <div className="w-full h-2 bg-[#e8e8e4] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isValidKit ? "bg-[#1e3a1e]" : "bg-[#d4a017]"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {!isValidKit && totalSelected > 0 && (
          <p className="text-xs text-[#9b9b9b] font-sans mt-1.5">
            Adicione mais <span className="font-semibold text-[#d4a017]">{remaining}</span> para completar o kit de {nextTargetQty}
          </p>
        )}
        {isValidKit && (
          <p className="text-xs text-[#1e3a1e] font-sans font-medium mt-1.5 flex items-center gap-1">
            <Check className="w-3 h-3" /> Kit completo!
          </p>
        )}
      </div>

      {/* Selected items list */}
      {selectedItems.size > 0 && (
        <div className={`space-y-2 mb-4 ${compact ? "max-h-32" : "max-h-48"} overflow-y-auto`}>
          {Array.from(selectedItems.entries()).map(([variantId, item]) => (
            <div key={variantId} className="flex items-center gap-2 bg-[#faf7f2] rounded-lg px-3 py-2">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#e8e8e4] flex-shrink-0">
                {item.product.node.images.edges[0]?.node?.url && (
                  <img
                    src={item.product.node.images.edges[0].node.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#1a1a1a] font-sans truncate">
                  {item.product.node.title}
                </p>
                <p className="text-[10px] text-[#9b9b9b] font-sans">×{item.quantity}</p>
              </div>
              <button
                onClick={() => onRemoveItem(variantId, item.product)}
                aria-label={`Remover ${item.product.node.title} do kit`}
                className="w-6 h-6 flex items-center justify-center hover:bg-white rounded transition-colors flex-shrink-0"
              >
                <Minus className="w-3 h-3 text-[#9b9b9b]" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Estimated Price */}
      {totalSelected > 0 && (
        <div className="bg-[#faf7f2] rounded-xl p-4 mb-4 border border-[#e8e8e4]/60">
          <p className="text-xs text-[#9b9b9b] font-sans mb-2">Preço estimado</p>
          {discount > 0 && (
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-sm text-[#9b9b9b] line-through font-sans">
                R$ {formatPrice(estimatedBase)}
              </span>
              <span className="text-xs font-semibold text-[#1e3a1e] bg-[#1e3a1e]/10 px-2 py-0.5 rounded-full">
                -{discount}%
              </span>
            </div>
          )}
          <p className="text-xl font-bold text-[#1a1a1a] font-sans">
            {discount > 0 ? `~R$ ${formatPrice(estimatedDiscounted)}` : `R$ ${formatPrice(estimatedBase)}`}
          </p>
          {discount > 0 && (
            <p className="text-[11px] text-[#9b9b9b] font-sans mt-1.5">
              Desconto aplicado automaticamente no carrinho
            </p>
          )}
        </div>
      )}

      <PixCallout variant="card" className="mb-3" />
      {!compact && <BenefitsSummary className="mb-4" />}

      {/* Add Button (desktop only — mobile has its own) */}
      {!compact && (
        <button
          onClick={onAddKit}
          disabled={!isValidKit || isAdding || cartIsLoading}
          className="w-full h-14 bg-[#1e3a1e] text-white rounded-2xl font-bold text-sm font-sans shadow-[0px_4px_20px_0px_rgba(30,58,30,0.28)] hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isAdding ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isValidKit ? (
            <>
              <ShoppingBag className="w-5 h-5" />
              Adicionar Kit de {totalSelected} ao Carrinho
            </>
          ) : totalSelected === 0 ? (
            "Selecione pratos para montar seu kit"
          ) : (
            `Adicione mais ${remaining} para completar`
          )}
        </button>
      )}
    </div>
  );
}
