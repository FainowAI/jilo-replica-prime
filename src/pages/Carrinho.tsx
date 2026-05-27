import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus, Trash2, Loader2, Truck, ChevronRight, ShieldCheck, Snowflake, Tag } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/stores/cartStore";
import { storefrontApiRequest, PRODUCTS_QUERY, setCartAttributes, appendReturnToCheckoutUrl, type ShopifyProduct } from "@/lib/shopify";
import { SITE_URL } from "@/config/site";
import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";
import BenefitsSummary from "@/components/BenefitsSummary";
import PaymentMethodSelector from "@/components/PaymentMethodSelector";
import DeliveryAddressSelector from "@/components/DeliveryAddressSelector";
import { type CepValidationResult } from "@/lib/cepValidator";
import AuthDialog from "@/components/AuthDialog";
import { useAuth } from "@/contexts/AuthContext";
import ShippingMethodSelector from "@/components/ShippingMethodSelector";
import { isFreeShipping, getDeliveryMethod, isShippingVariant, SHIPPING_FREE_THRESHOLD } from "@/config/shipping";
import { useNonShippingTotalItems, useVisibleCartItems } from "@/hooks/useNonShippingTotalItems";
import SEO from "@/components/SEO";

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
    discountCodes,
    applyDiscountCode,
    removeDiscountCode,
    cartCost,
    cartDiscountAllocations,
    refreshCartDetails,
  } = useCartStore();

  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [suggestions, setSuggestions] = useState<ShopifyProduct[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [deliveryCheck, setDeliveryCheck] = useState<CepValidationResult | null>(null);
  const { user } = useAuth();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(false);
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);
  const [activeShippingFeeCents, setActiveShippingFeeCents] = useState(0);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const totalNonShippingItems = useNonShippingTotalItems();
  const visibleItems = useVisibleCartItems();
  const totalItems = totalNonShippingItems;
  const subtotal = visibleItems.reduce(
    (sum, item) => sum + parseFloat(item.price.amount) * item.quantity,
    0
  );
  const shopifyTotal = cartCost ? parseFloat(cartCost.totalAmount) : null;
  const displayTotal = shopifyTotal ?? subtotal;

  const appliedDiscount = discountCodes.find((dc) => dc.applicable);
  const hasAppliedCoupon = !!appliedDiscount;
  // canCheckout cobre 4 condições:
  // 1. Endereço selecionado e em SJC (whitelist DELIVERY_AREAS)
  // 2. Frete resolvido — ou é grátis (cart ≥ 7) ou tem quote Uber ativa
  // 3. Cart não-vazio (verificado depois no disabled do botão)
  // 4. **NOVO (Sprint 4.7):** o cartCost.totalAmount do Shopify reflete o estado
  //    real esperado (subtotal + frete). Sem isso, falha silenciosa na sincronização
  //    da variant fantasma (ex: edge `update-shipping-variant-price` retornando 401)
  //    permitiria avançar pro checkout com frete não cobrado — perda direta de receita.
  const expectedTotal = subtotal + activeShippingFeeCents / 100;
  const totalMatchesShopify =
    shopifyTotal !== null && Math.abs(shopifyTotal - expectedTotal) < 0.01;

  const canCheckout =
    deliveryCheck?.isDeliverable === true &&
    (isFreeShipping(totalNonShippingItems) || activeQuoteId !== null) &&
    // Em frete grátis: expectedTotal = subtotal, validado normalmente.
    // Em frete pago: expectedTotal inclui frete; se a variant fantasma não entrou
    // no Shopify Cart, shopifyTotal == subtotal != expectedTotal → bloqueia.
    totalMatchesShopify;

  useEffect(() => {
    syncCart();
    refreshCartDetails();
  }, [syncCart, refreshCartDetails]);

  useEffect(() => {
    refreshCartDetails();
  }, [discountCodes, refreshCartDetails]);

  // Diagnóstico defensivo (Sprint 4.7): se quote Uber está ativa mas o Shopify Cart
  // não inclui o frete esperado, logar warning. Isso indica falha na sincronização
  // da variant fantasma (provavelmente edge update-shipping-variant-price com erro).
  // Cliente legítimo é protegido pelo hard-block do canCheckout, mas o time precisa
  // saber pra investigar.
  useEffect(() => {
    if (
      !isFreeShipping(totalNonShippingItems) &&
      activeQuoteId !== null &&
      shopifyTotal !== null &&
      !totalMatchesShopify
    ) {
      console.warn(
        "[Carrinho] Discrepância detectada: quote Uber ativa mas Shopify Cart sem frete. " +
        "Variant fantasma pode não ter entrado. Checkout bloqueado por segurança.",
        {
          subtotal,
          activeShippingFeeCents,
          expectedTotal,
          shopifyTotal,
          diff: shopifyTotal !== null ? shopifyTotal - expectedTotal : null,
        }
      );
    }
  }, [
    totalMatchesShopify,
    activeQuoteId,
    shopifyTotal,
    subtotal,
    activeShippingFeeCents,
    expectedTotal,
    totalNonShippingItems,
  ]);

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

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponError(null);
    setApplyingCoupon(true);
    try {
      const result = await applyDiscountCode(code);
      if (result.success && result.applicable) {
        setCouponCode("");
        toast.success(`Cupom ${code} aplicado!`);
      } else if (result.success && !result.applicable) {
        setCouponError("Cupom inválido ou expirado");
        toast.error("Cupom inválido ou expirado");
      } else {
        setCouponError("Erro ao aplicar cupom. Tente novamente.");
        toast.error("Erro ao aplicar cupom");
      }
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = async () => {
    await removeDiscountCode();
    toast.success("Cupom removido");
  };

  const handleCheckout = async () => {
    if (!user) {
      setPendingCheckout(true);
      setAuthDialogOpen(true);
      return;
    }
    const cartId = useCartStore.getState().cartId;
    if (cartId) {
      const attrs: Array<{ key: string; value: string }> = [
        { key: "delivery_method", value: getDeliveryMethod(totalNonShippingItems) },
        { key: "return_url", value: SITE_URL },
      ];
      if (activeQuoteId) {
        attrs.push({ key: "uber_quote_id", value: activeQuoteId });
      }
      if (selectedAddressId) {
        attrs.push({ key: "selected_address_id", value: selectedAddressId });
      }
      // Fail-silent: se a chamada falhar, segue o checkout (R26)
      await setCartAttributes(cartId, attrs);
    }
    const checkoutUrl = getCheckoutUrl();
    if (checkoutUrl) {
      window.open(appendReturnToCheckoutUrl(checkoutUrl), "_blank");
    }
  };

  // Se usuário logou depois de clicar em "Ir para o Checkout", finaliza o fluxo automaticamente
  useEffect(() => {
    if (user && pendingCheckout) {
      setPendingCheckout(false);
      (async () => {
        const cartId = useCartStore.getState().cartId;
        if (cartId) {
          const attrs: Array<{ key: string; value: string }> = [
            { key: "delivery_method", value: getDeliveryMethod(totalNonShippingItems) },
            { key: "return_url", value: SITE_URL },
          ];
          if (activeQuoteId) {
            attrs.push({ key: "uber_quote_id", value: activeQuoteId });
          }
          if (selectedAddressId) {
            attrs.push({ key: "selected_address_id", value: selectedAddressId });
          }
          await setCartAttributes(cartId, attrs);
        }
        const checkoutUrl = getCheckoutUrl();
        if (checkoutUrl) {
          window.open(appendReturnToCheckoutUrl(checkoutUrl), "_blank");
        }
      })();
    }
  }, [user, pendingCheckout, getCheckoutUrl, activeQuoteId, totalNonShippingItems, selectedAddressId]);

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
      <SEO
        title="Meu Carrinho | Jilo"
        description="Revise seus pratos, aplique cupom e calcule o frete antes de finalizar seu pedido Jilo."
        path="/carrinho"
      />
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
            {/* Cart Items Table */}
            <div className="bg-white rounded-2xl border border-[#e8e8e4] overflow-hidden mb-6">
              {/* Table Header */}
              <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-4 px-6 py-3 border-b border-[#e8e8e4] text-xs text-[#9b9b9b] font-sans uppercase tracking-wider">
                <span>Produto</span>
                <span className="w-28 text-center">Qtd</span>
                <span className="w-24 text-right">Subtotal</span>
              </div>

              {/* Items */}
              {visibleItems.map((item) => {
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
            {hasAppliedCoupon ? (
              <div className="bg-white rounded-2xl border border-[#1e3a1e]/20 p-4 mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1e3a1e]/10 flex items-center justify-center">
                    <Tag className="h-4 w-4 text-[#1e3a1e]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1a1a1a] font-sans">
                      Cupom {appliedDiscount!.code} aplicado!
                    </p>
                    <p className="text-xs text-[#1e3a1e] font-sans">
                      Desconto será aplicado no checkout
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
                    disabled={applyingCoupon || !couponCode.trim()}
                    className="px-5 py-2.5 bg-[#1e3a1e] text-white rounded-lg text-sm font-semibold font-sans hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50"
                  >
                    {applyingCoupon ? "Aplicando..." : "Aplicar"}
                  </button>
                </div>
                {couponError && (
                  <p className="text-xs text-red-500 mt-1 font-sans">{couponError}</p>
                )}
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

              <BenefitsSummary className="mb-6" />

              {/* Delivery Address Selector */}
              <DeliveryAddressSelector
                onResult={(result) => setDeliveryCheck(result)}
                onAddressIdChange={(id) => setSelectedAddressId(id)}
                className="mb-4"
              />

              <ShippingMethodSelector
                totalNonShippingItems={totalNonShippingItems}
                deliveryCheck={deliveryCheck}
                onQuoteChange={(quoteId, feeCents) => {
                  setActiveQuoteId(quoteId);
                  setActiveShippingFeeCents(feeCents);
                }}
              />

              {/* Divider */}
              <div className="h-px bg-[#e8e8e4] mb-4" />

              {/* Price Breakdown */}
              <div className="space-y-2.5 mb-4 font-sans">
                {/* Subtotal */}
                <div className="flex justify-between text-sm">
                  <span className="text-[#1a1a1a]">Subtotal ({totalItems} {totalItems === 1 ? "prato" : "pratos"})</span>
                  <span className="font-semibold text-[#1a1a1a]">R$ {subtotal.toFixed(2).replace(".", ",")}</span>
                </div>

                {/* Desconto automático do Shopify */}
                {cartDiscountAllocations.length > 0 && cartDiscountAllocations.map((alloc, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-[#1e3a1e]">{alloc.title || alloc.code || "Desconto de kit"}</span>
                    <span className="font-semibold text-[#1e3a1e]">-R$ {parseFloat(alloc.discountedAmount.amount).toFixed(2).replace(".", ",")}</span>
                  </div>
                ))}

                {/* Cupom manual */}
                {hasAppliedCoupon && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#1e3a1e]">Cupom {appliedDiscount!.code}</span>
                    <span className="font-semibold text-[#1e3a1e]">Aplicado ✓</span>
                  </div>
                )}

                {/* Frete */}
                <div className="flex justify-between text-sm">
                  <span className="text-[#9b9b9b]">Frete</span>
                  <span className="font-semibold text-[#1a1a1a]">
                    {isFreeShipping(totalNonShippingItems)
                      ? <span className="text-[#1e3a1e]">Grátis</span>
                      : activeShippingFeeCents > 0
                        ? `R$ ${(activeShippingFeeCents / 100).toFixed(2).replace(".", ",")}`
                        : <span className="text-[#9b9b9b]">—</span>}
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-[#e8e8e4] mb-4" />

              {/* Total */}
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-lg font-bold text-[#1a1a1a] font-sans">TOTAL</span>
                <span className="text-2xl font-bold text-[#1a1a1a] font-sans">
                  R$ {displayTotal.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <p className="text-right text-xs text-[#9b9b9b] font-sans mb-5">
                Descontos aplicados no checkout Shopify
              </p>



              {/* Payment Method Selector */}
              <div className="mb-5">
                <PaymentMethodSelector subtotalCents={Math.round(subtotal * 100)} totalNonShippingItems={totalNonShippingItems} />
              </div>

              {/* Checkout Button */}
              <button
                onClick={handleCheckout}
                disabled={items.length === 0 || isLoading || isSyncing || !canCheckout}
                className="w-full h-14 bg-[#1e3a1e] text-white rounded-2xl font-bold text-base font-sans shadow-[0px_4px_20px_0px_rgba(30,58,30,0.28)] hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading || isSyncing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : !deliveryCheck ? (
                  "Selecione um endereço"
                ) : !deliveryCheck.isDeliverable ? (
                  "Endereço fora da cobertura"
                ) : !isFreeShipping(totalNonShippingItems) && !activeQuoteId ? (
                  "Calculando frete..."
                ) : !isFreeShipping(totalNonShippingItems) && activeQuoteId && !totalMatchesShopify ? (
                  // Quote Uber existe mas variant fantasma não está no Shopify Cart.
                  // Falha de sincronização (ex: edge update-shipping-variant-price com erro).
                  // Bloqueia avanço pra não cobrar frete zero do cliente.
                  "Sincronizando frete..."
                ) : !user ? (
                  <>
                    Entrar para finalizar
                    <ChevronRight className="h-4 w-4" />
                  </>
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

        <AuthDialog
          open={authDialogOpen}
          onOpenChange={(open) => {
            setAuthDialogOpen(open);
            if (!open && !user) {
              // Usuário fechou o modal sem logar — cancela o pending checkout
              setPendingCheckout(false);
            }
          }}
          initialMode="signup"
        />
      </main>

      <Footer />
    </div>
  );
};

export default Carrinho;
