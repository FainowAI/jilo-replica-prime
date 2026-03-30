import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus, Trash2, Loader2, Truck, ChevronRight, ShieldCheck, Snowflake, Tag, X } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { storefrontApiRequest, PRODUCTS_QUERY, type ShopifyProduct } from "@/lib/shopify";
import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";

const FREE_SHIPPING_THRESHOLD = 150.0;
const PIX_DISCOUNT = 0.05;

const Carrinho = () => {
  const {
    items,
    isLoading,
    isSyncing,
    updateQuantity,
    removeItem,
    getCheckoutUrl,
    addItem,
    syncCart,
  } = useCartStore();

  const [cep, setCep] = useState("");
  const [shippingCalculated, setShippingCalculated] = useState(false);
  const [shippingCost, setShippingCost] = useState(12.90);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [suggestions, setSuggestions] = useState<ShopifyProduct[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + parseFloat(item.price.amount) * item.quantity,
    0
  );
  const amountToFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const freeShippingProgress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
  const hasFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;

  const couponDiscount = appliedCoupon?.discount ?? 0;
  const shipping = hasFreeShipping ? 0 : shippingCalculated ? shippingCost : 0;
  const pixDiscount = (subtotal - couponDiscount + shipping) * PIX_DISCOUNT;
  const total = subtotal - couponDiscount + shipping;
  const totalPix = total - pixDiscount;

  useEffect(() => {
    syncCart();
  }, [syncCart]);

  const fetchSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const data = await storefrontApiRequest(PRODUCTS_QUERY, { first: 20 });
      if (data?.data?.products?.edges) {
        const cartVariantIds = new Set(items.map((i) => i.variantId));
        const filtered = data.data.products.edges.filter(
          (p: ShopifyProduct) =>
            !p.node.variants.edges.some((v) => cartVariantIds.has(v.node.id))
        );
        // Shuffle and take 4
        const shuffled = filtered.sort(() => Math.random() - 0.5);
        setSuggestions(shuffled.slice(0, 4));
      }
    } catch (err) {
      console.error("Failed to fetch suggestions:", err);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [items]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleCalculateShipping = () => {
    if (cep.replace(/\D/g, "").length === 8) {
      setShippingCalculated(true);
    }
  };

  const handleApplyCoupon = () => {
    if (couponCode.trim().toUpperCase() === "BEMVINDO10") {
      setAppliedCoupon({ code: "BEMVINDO10", discount: 10 });
      setCouponCode("");
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
  };

  const handleCheckout = () => {
    const checkoutUrl = getCheckoutUrl();
    if (checkoutUrl) {
      window.open(checkoutUrl, "_blank");
    }
  };

  const handleAddSuggestion = async (product: ShopifyProduct) => {
    const variant = product.node.variants.edges[0]?.node;
    if (!variant) return;
    await addItem({
      product,
      variantId: variant.id,
      variantTitle: variant.title,
      price: variant.price,
      quantity: 1,
      selectedOptions: variant.selectedOptions,
    });
  };

  const formatCep = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return digits;
  };

  const getCategoryEmoji = (product: ShopifyProduct) => {
    const type = product.node.productType?.toLowerCase() || "";
    const tags = product.node.tags?.map((t) => t.toLowerCase()) || [];
    if (tags.includes("vegano")) return "🌱 Vegano";
    if (type.includes("aves") || type.includes("suíno")) return "🍗 Aves & Suínos";
    if (type.includes("bovino")) return "🥩 Bovinos";
    if (type.includes("peixe") || type.includes("massa")) return "🐟 Peixes & Massas";
    return "🍽️ Prato";
  };

  const getBadge = (product: ShopifyProduct) => {
    const tags = product.node.tags?.map((t) => t.toLowerCase()) || [];
    if (tags.includes("mais-pedido")) return { label: "Mais pedido", color: "bg-[#d4a017] text-white" };
    if (tags.includes("low-carb")) return { label: "Low Carb", color: "bg-[#1e3a1e] text-white" };
    if (tags.includes("novo")) return { label: "Novo", color: "bg-[#e8e8e4] text-[#1a1a1a]" };
    return null;
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#faf7f2]">
        <AnnouncementBar />
        <Header />
        <main className="container mx-auto px-4 py-16 text-center">
          <h1 className="font-['DM_Serif_Display'] text-3xl text-[#1a1a1a] mb-4">
            Meu Carrinho
          </h1>
          <p className="text-[#9b9b9b] mb-8">Seu carrinho está vazio 🛒</p>
          <Link
            to="/cardapio"
            className="inline-flex items-center gap-2 px-8 py-3 bg-[#1e3a1e] text-white rounded-[14px] text-sm font-bold hover:bg-[#1e3a1e]/90 transition-colors"
          >
            Ver cardápio
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

      <main className="container mx-auto px-4 pt-6 pb-16">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-[#9b9b9b] mb-6 font-sans">
          <Link to="/" className="hover:text-[#1a1a1a] transition-colors">
            Página Inicial
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-[#1a1a1a] font-medium">Meu Carrinho</span>
        </nav>

        {/* Title */}
        <div className="mb-8">
          <h1 className="font-['DM_Serif_Display'] text-3xl lg:text-4xl text-[#1a1a1a] mb-1">
            Meu Carrinho
          </h1>
          <p className="text-sm text-[#9b9b9b] font-sans">
            {totalItems} {totalItems === 1 ? "prato" : "pratos"} no seu carrinho.
            Revisão antes de finalizar.
          </p>
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Column — Cart Items */}
          <div className="flex-1">
            {/* Free Shipping Bar */}
            <div className="bg-white rounded-2xl p-4 mb-6 border border-[#e8e8e4]">
              <div className="flex items-center gap-3">
                <Truck className="h-5 w-5 text-[#1e3a1e] flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-[#1a1a1a] font-sans">
                    {amountToFreeShipping > 0 ? (
                      <>
                        Faltam{" "}
                        <span className="font-bold text-[#1e3a1e]">
                          R$ {amountToFreeShipping.toFixed(2).replace(".", ",")}
                        </span>{" "}
                        para ganhar{" "}
                        <span className="font-bold">FRETE GRÁTIS!</span>
                      </>
                    ) : (
                      <span className="font-bold text-[#1e3a1e]">
                        Você ganhou FRETE GRÁTIS! 🎉
                      </span>
                    )}
                  </p>
                  <div className="w-full h-2 bg-[#e8e8e4] rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-[#d4a017] rounded-full transition-all duration-500"
                      style={{ width: `${freeShippingProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Cart Items Table */}
            <div className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden mb-6">
              {/* Table Header */}
              <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-4 px-6 py-3 border-b border-[#e8e8e4] text-xs text-[#9b9b9b] font-sans uppercase tracking-wider">
                <span>Produto</span>
                <span className="w-28 text-center">Qtd</span>
                <span className="w-24 text-right">Subtotal</span>
              </div>

              {/* Items */}
              {items.map((item) => {
                const itemTotal = parseFloat(item.price.amount) * item.quantity;
                const imageUrl =
                  item.product.node.images?.edges?.[0]?.node?.url;
                const description = item.product.node.description;

                return (
                  <div
                    key={item.variantId}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-4 px-6 py-5 border-b border-[#e8e8e4] last:border-b-0 items-center"
                  >
                    {/* Product Info */}
                    <div className="flex gap-4">
                      <Link
                        to={`/produto/${item.product.node.handle}`}
                        className="w-20 h-20 bg-[#f0efeb] rounded-xl overflow-hidden flex-shrink-0"
                      >
                        {imageUrl && (
                          <img
                            src={imageUrl}
                            alt={item.product.node.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </Link>
                      <div className="min-w-0">
                        <Link
                          to={`/produto/${item.product.node.handle}`}
                          className="text-sm font-semibold text-[#1a1a1a] hover:underline line-clamp-1 font-sans"
                        >
                          {item.product.node.title}
                        </Link>
                        <p className="text-xs text-[#1e3a1e] font-sans mt-0.5">
                          🥩 {item.product.node.productType || "Prato"}
                        </p>
                        {description && (
                          <p className="text-xs text-[#9b9b9b] font-sans mt-0.5 line-clamp-1">
                            {description}
                          </p>
                        )}
                        <p className="text-xs text-[#9b9b9b] font-sans mt-0.5">
                          R$ {parseFloat(item.price.amount).toFixed(2).replace(".", ",")} / un
                        </p>
                      </div>
                    </div>

                    {/* Quantity */}
                    <div className="flex items-center gap-3 sm:justify-center">
                      <div className="flex items-center border border-[#e8e8e4] rounded-lg">
                        <button
                          onClick={() =>
                            updateQuantity(
                              item.variantId,
                              Math.max(1, item.quantity - 1)
                            )
                          }
                          disabled={isLoading || item.quantity <= 1}
                          className="h-9 w-9 flex items-center justify-center hover:bg-[#f0efeb] transition-colors disabled:opacity-40 rounded-l-lg"
                        >
                          <Minus className="h-3.5 w-3.5 text-[#1a1a1a]" />
                        </button>
                        <span className="w-10 text-center text-sm font-semibold text-[#1a1a1a] border-x border-[#e8e8e4] h-9 flex items-center justify-center font-sans">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateQuantity(item.variantId, item.quantity + 1)
                          }
                          disabled={isLoading}
                          className="h-9 w-9 flex items-center justify-center hover:bg-[#f0efeb] transition-colors disabled:opacity-40 rounded-r-lg"
                        >
                          <Plus className="h-3.5 w-3.5 text-[#1a1a1a]" />
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(item.variantId)}
                        disabled={isLoading}
                        className="text-xs text-[#d4a017] hover:text-[#b8891a] font-sans font-medium transition-colors disabled:opacity-40"
                      >
                        Remover
                      </button>
                    </div>

                    {/* Subtotal */}
                    <div className="text-right">
                      <p className="text-base font-bold text-[#1a1a1a] font-sans">
                        R$ {itemTotal.toFixed(2).replace(".", ",")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Coupon */}
            {appliedCoupon ? (
              <div className="bg-white rounded-2xl border border-[#1e3a1e]/20 p-4 mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1e3a1e]/10 flex items-center justify-center">
                    <Tag className="h-4 w-4 text-[#1e3a1e]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1a1a1a] font-sans">
                      Cupom {appliedCoupon.code} aplicado!
                    </p>
                    <p className="text-xs text-[#1e3a1e] font-sans">
                      - R$ {appliedCoupon.discount.toFixed(2).replace(".", ",")} de desconto
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRemoveCoupon}
                  className="text-xs text-[#d4a017] hover:text-[#b8891a] font-sans font-medium transition-colors"
                >
                  Remover
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#e8e8e4] p-4 mb-6">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Código do cupom"
                    className="flex-1 px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans bg-transparent focus:outline-none focus:border-[#1e3a1e] transition-colors"
                    onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                  />
                  <button
                    onClick={handleApplyCoupon}
                    className="px-5 py-2.5 bg-[#1e3a1e] text-white rounded-lg text-sm font-semibold font-sans hover:bg-[#1e3a1e]/90 transition-colors"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            )}

            {/* Continue Shopping */}
            <Link
              to="/cardapio"
              className="inline-flex items-center gap-2 text-sm text-[#9b9b9b] hover:text-[#1a1a1a] font-sans transition-colors"
            >
              ← Continuar comprando
            </Link>
          </div>

          {/* Right Column — Order Summary */}
          <div className="lg:w-[380px] flex-shrink-0">
            <div className="bg-white rounded-2xl border border-[#e8e8e4] p-6 lg:sticky lg:top-24">
              <h2 className="font-['DM_Serif_Display'] text-xl text-[#1a1a1a] mb-5">
                Resumo do Pedido
              </h2>

              {/* CEP Calculator */}
              <p className="text-sm text-[#9b9b9b] font-sans mb-2">Calcule o frete</p>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={cep}
                  onChange={(e) => setCep(formatCep(e.target.value))}
                  placeholder="00000-000"
                  className="flex-1 px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans bg-transparent focus:outline-none focus:border-[#1e3a1e] transition-colors"
                  maxLength={9}
                  onKeyDown={(e) => e.key === "Enter" && handleCalculateShipping()}
                />
                <button
                  onClick={handleCalculateShipping}
                  className="px-5 py-2.5 bg-[#1e3a1e] text-white rounded-lg text-sm font-bold font-sans hover:bg-[#1e3a1e]/90 transition-colors"
                >
                  OK
                </button>
              </div>

              {/* Shipping Estimate */}
              {shippingCalculated && (
                <div className="flex items-center gap-2 bg-[#faf7f2] rounded-lg px-3 py-2.5 mb-5 border border-[#e8e8e4]/60">
                  <Truck className="h-4 w-4 text-[#d4a017] flex-shrink-0" />
                  <p className="text-xs text-[#1a1a1a] font-sans">
                    Entrega em até 48h —{" "}
                    {hasFreeShipping ? (
                      <span className="font-bold text-[#1e3a1e]">GRÁTIS</span>
                    ) : (
                      <span className="font-semibold">
                        R$ {shippingCost.toFixed(2).replace(".", ",")}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Divider */}
              <div className="h-px bg-[#e8e8e4] mb-4" />

              {/* Price Breakdown */}
              <div className="space-y-2.5 mb-4 font-sans">
                <div className="flex justify-between text-sm">
                  <span className="text-[#1a1a1a]">
                    Subtotal ({totalItems} {totalItems === 1 ? "prato" : "pratos"})
                  </span>
                  <span className="font-semibold text-[#1a1a1a]">
                    R$ {subtotal.toFixed(2).replace(".", ",")}
                  </span>
                </div>

                {appliedCoupon && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#1e3a1e]">
                      Desconto ({appliedCoupon.code})
                    </span>
                    <span className="font-semibold text-[#1e3a1e]">
                      − R$ {couponDiscount.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-sm">
                  <span className="text-[#9b9b9b]">Frete</span>
                  <span className="text-[#9b9b9b]">
                    {!shippingCalculated
                      ? "Calcule acima"
                      : hasFreeShipping
                        ? "GRÁTIS"
                        : `R$ ${shippingCost.toFixed(2).replace(".", ",")}`}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-[#9b9b9b] italic">Desconto PIX (5%)</span>
                  <span className="text-[#9b9b9b] italic">
                    − R$ {pixDiscount.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-[#e8e8e4] mb-4" />

              {/* Total */}
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-lg font-bold text-[#1a1a1a] font-sans">TOTAL</span>
                <span className="text-2xl font-bold text-[#1a1a1a] font-sans">
                  R$ {total.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <p className="text-right text-xs text-[#9b9b9b] font-sans mb-5">
                ou{" "}
                <span className="font-bold text-[#1e3a1e]">
                  R$ {totalPix.toFixed(2).replace(".", ",")}
                </span>{" "}
                pagando no PIX
              </p>

              {/* PIX Banner */}
              <div className="bg-[#1e3a1e]/5 border border-[#1e3a1e]/20 rounded-xl px-4 py-3 mb-5 flex items-center justify-center gap-2">
                <span className="text-sm text-[#1e3a1e] font-sans">
                  💰 Pague no PIX e economize{" "}
                  <span className="font-bold">
                    R$ {pixDiscount.toFixed(2).replace(".", ",")}
                  </span>
                </span>
              </div>

              {/* Payment Methods */}
              <div className="space-y-3 mb-5 font-sans">
                <div>
                  <p className="text-[10px] text-[#9b9b9b] uppercase tracking-wider mb-1.5">
                    Vale-Refeição
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {["VA/VR", "Alelo", "Sodexo", "VR", "Ticket", "Flash"].map(
                      (m) => (
                        <span
                          key={m}
                          className="px-2.5 py-1 bg-[#f0efeb] rounded text-[10px] font-medium text-[#1a1a1a]"
                        >
                          {m}
                        </span>
                      )
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-[#9b9b9b] uppercase tracking-wider mb-1.5">
                    Cartões
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { name: "VISA", bg: "bg-[#1a1f71]", text: "text-white" },
                      { name: "MASTER", bg: "bg-[#eb001b]", text: "text-white" },
                      { name: "ELO", bg: "bg-[#1a1a1a]", text: "text-white" },
                      { name: "HIPER", bg: "bg-[#f37021]", text: "text-white" },
                    ].map((c) => (
                      <span
                        key={c.name}
                        className={`px-2.5 py-1 ${c.bg} ${c.text} rounded text-[10px] font-bold`}
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-[#9b9b9b] uppercase tracking-wider mb-1.5">
                    Instantâneo
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2.5 py-1 bg-[#32bcad] text-white rounded text-[10px] font-bold">
                      PIX
                    </span>
                  </div>
                </div>
              </div>

              {/* Checkout Button */}
              <button
                onClick={handleCheckout}
                disabled={items.length === 0 || isLoading || isSyncing}
                className="w-full h-14 bg-[#1e3a1e] text-white rounded-2xl font-bold text-base font-sans shadow-[0px_4px_20px_0px_rgba(30,58,30,0.28)] hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading || isSyncing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Ir para o Checkout
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>

              {/* Trust Badges */}
              <div className="flex items-center justify-center gap-4 mt-4 text-xs text-[#9b9b9b] font-sans">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Compra 100% segura
                </span>
                <span className="flex items-center gap-1">
                  <Snowflake className="h-3.5 w-3.5" />
                  Entregue gelado
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Complete sua semana — Suggestions */}
        <section className="mt-16">
          <div className="mb-8">
            <h2 className="font-['DM_Serif_Display'] text-2xl lg:text-3xl text-[#1a1a1a] mb-1">
              Complete sua semana
            </h2>
            <p className="text-sm text-[#9b9b9b] font-sans">
              Pratos que combinam com o que você escolheu
            </p>
          </div>

          {loadingSuggestions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#1e3a1e]" />
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {suggestions.map((product) => {
                const variant = product.node.variants.edges[0]?.node;
                if (!variant) return null;
                const price = parseFloat(variant.price.amount);
                const pixPrice = price * (1 - PIX_DISCOUNT);
                const compareAt = variant.compareAtPrice
                  ? parseFloat(variant.compareAtPrice.amount)
                  : null;
                const imageUrl =
                  product.node.images?.edges?.[0]?.node?.url;
                const badge = getBadge(product);

                return (
                  <div
                    key={product.node.id}
                    className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden group"
                  >
                    {/* Image */}
                    <Link
                      to={`/produto/${product.node.handle}`}
                      className="block relative aspect-square overflow-hidden"
                    >
                      {imageUrl && (
                        <img
                          src={imageUrl}
                          alt={product.node.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      )}
                      {badge && (
                        <span
                          className={`absolute top-3 left-3 px-2.5 py-1 ${badge.color} rounded-full text-[10px] font-bold`}
                        >
                          {badge.label}
                        </span>
                      )}
                    </Link>

                    {/* Info */}
                    <div className="p-4">
                      <Link
                        to={`/produto/${product.node.handle}`}
                        className="block"
                      >
                        <h3 className="text-sm font-semibold text-[#1a1a1a] font-sans line-clamp-1 mb-1">
                          {product.node.title}
                        </h3>
                      </Link>
                      <p className="text-[11px] text-[#1e3a1e] font-sans mb-2">
                        {getCategoryEmoji(product)}
                      </p>

                      {/* Price */}
                      <div className="mb-3">
                        {compareAt && compareAt > price && (
                          <p className="text-xs text-[#9b9b9b] line-through font-sans">
                            R$ {compareAt.toFixed(2).replace(".", ",")}
                          </p>
                        )}
                        <p className="text-base font-bold text-[#1a1a1a] font-sans">
                          R$ {price.toFixed(2).replace(".", ",")}
                        </p>
                      </div>

                      {/* Add Button */}
                      <button
                        onClick={() => handleAddSuggestion(product)}
                        disabled={isLoading}
                        className="w-full py-2.5 bg-[#1e3a1e] text-white rounded-xl text-xs font-bold font-sans hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50"
                      >
                        + ADICIONAR
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Carrinho;
