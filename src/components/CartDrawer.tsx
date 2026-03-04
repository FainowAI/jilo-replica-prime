import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ShoppingCart, Minus, Plus, Trash2, Loader2, ArrowLeft, Truck } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";

const FREE_SHIPPING_THRESHOLD = 150.0;

export const CartDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { items, isLoading, isSyncing, updateQuantity, removeItem, getCheckoutUrl, syncCart } = useCartStore();
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.price.amount) * item.quantity), 0);
  const amountToFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const freeShippingProgress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);

  useEffect(() => { if (isOpen) syncCart(); }, [isOpen, syncCart]);

  const handleCheckout = async () => {
    const checkoutUrl = getCheckoutUrl();
    if (checkoutUrl) {
      window.open(checkoutUrl, '_blank');
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button className="relative p-2 hover:opacity-70 transition-opacity">
          <ShoppingCart className="h-5 w-5" />
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-accent text-accent-foreground text-[10px] flex items-center justify-center font-bold">
              {totalItems}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-[420px] flex flex-col h-full p-0 bg-white border-l border-[#e8e8e4]">
        {/* Header */}
        <div className="border-b border-[#e8e8e4] px-5 py-4 flex items-center justify-between">
          <button
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-1.5 text-[#9b9b9b] hover:text-[#1a1a1a] transition-colors text-[13px]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Continuar comprando</span>
          </button>
          <h2 className="font-['DM_Serif_Display'] text-lg text-[#1a1a1a]">Meu Carrinho</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#9b9b9b]">{totalItems} {totalItems === 1 ? 'item' : 'itens'}</span>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-[#f0efeb] rounded transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[#1a1a1a]">
                <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-5 bg-[#faf7f2]">
            <ShoppingCart className="h-16 w-16 text-[#9b9b9b] mb-4" />
            <p className="text-[#9b9b9b] text-sm mb-6">Seu carrinho está vazio 🛒</p>
            <a
              href="/#cardapio"
              onClick={() => setIsOpen(false)}
              className="px-6 py-3 bg-[#1e3a1e] text-white rounded-[14px] text-sm font-semibold hover:bg-[#1e3a1e]/90 transition-colors"
            >
              Ver cardápio
            </a>
          </div>
        ) : (
          <>
            {/* Free Shipping Progress */}
            <div className="bg-[#faf7f2] px-5 pt-3 pb-4">
              <div className="flex items-start gap-2.5">
                <Truck className="h-[18px] w-[18px] text-[#1e3a1e] mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-[13px] text-[#1a1a1a] leading-[16.9px] mb-2">
                    {amountToFreeShipping > 0 ? (
                      <>
                        Faltam <span className="font-bold text-[#1e3a1e]">R$ {amountToFreeShipping.toFixed(2)}</span> para ganhar <span className="font-bold">FRETE GRÁTIS!</span>
                      </>
                    ) : (
                      <span className="font-bold text-[#1e3a1e]">Você ganhou FRETE GRÁTIS! 🎉</span>
                    )}
                  </p>
                  <div className="w-full h-1.5 bg-[#e8e8e4] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#d4a017] rounded-full transition-all duration-300"
                      style={{ width: `${freeShippingProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-3">
              <div className="space-y-3">
                {items.map((item) => {
                  const itemTotal = parseFloat(item.price.amount) * item.quantity;
                  const imageUrl = item.product.node.images?.edges?.[0]?.node?.url;

                  return (
                    <div key={item.variantId} className="flex gap-3">
                      {/* Product Image */}
                      <div className="w-20 h-20 bg-[#f0efeb] rounded-[10px] overflow-hidden flex-shrink-0">
                        {imageUrl && (
                          <img
                            src={imageUrl}
                            alt={item.product.node.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-[#1a1a1a] leading-[18.2px] mb-0.5 line-clamp-2">
                          {item.product.node.title}
                        </h4>
                        {item.selectedOptions.length > 0 && (
                          <p className="text-xs text-[#9b9b9b] leading-3 mb-0.5">
                            {item.selectedOptions.map(o => o.value).join(' • ')}
                          </p>
                        )}
                        <p className="text-[11px] italic text-[#b0aea8] leading-[14.3px] mb-0.5">
                          R$ {parseFloat(item.price.amount).toFixed(2)} / un
                        </p>
                      </div>

                      {/* Quantity & Price */}
                      <div className="flex flex-col items-end gap-2">
                        {/* Quantity Stepper */}
                        <div className="flex items-center border border-[#e8e8e4] rounded-full px-0.5 h-8">
                          <button
                            onClick={() => updateQuantity(item.variantId, Math.max(1, item.quantity - 1))}
                            disabled={isLoading || item.quantity <= 1}
                            className="h-8 w-8 flex items-center justify-center hover:bg-[#f0efeb] rounded-full transition-colors disabled:opacity-50"
                          >
                            <Minus className="h-3 w-3 text-[#1a1a1a]" />
                          </button>
                          <span className="w-7 text-center text-sm font-semibold text-[#1a1a1a]">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                            disabled={isLoading}
                            className="h-8 w-8 flex items-center justify-center hover:bg-[#f0efeb] rounded-full transition-colors disabled:opacity-50"
                          >
                            <Plus className="h-3 w-3 text-[#1a1a1a]" />
                          </button>
                        </div>

                        {/* Item Total Price */}
                        <p className="text-sm font-semibold text-[#1e3a1e]">
                          R$ {itemTotal.toFixed(2)}
                        </p>

                        {/* Remove Button */}
                        <button
                          onClick={() => removeItem(item.variantId)}
                          disabled={isLoading}
                          className="h-[19px] w-[19px] flex items-center justify-center hover:bg-[#f0efeb] rounded transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[#9b9b9b]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Order Summary Footer */}
            <div className="border-t border-[#e8e8e4] bg-white px-5 pt-4 pb-5 shadow-[0px_-4px_16px_0px_rgba(0,0,0,0.06)]">
              {/* Summary Details */}
              <div className="space-y-2 mb-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#1a1a1a]">Subtotal ({totalItems} {totalItems === 1 ? 'prato' : 'pratos'})</span>
                  <span className="text-sm font-semibold text-[#1a1a1a]">R$ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[13px] text-[#9b9b9b]">Frete</span>
                  <span className="text-[13px] text-[#9b9b9b]">Calcular no checkout</span>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-[#e8e8e4] my-3" />

              {/* Total */}
              <div className="flex justify-between items-center mb-3">
                <span className="text-base font-bold text-[#1a1a1a]">Total estimado</span>
                <span className="text-base font-bold text-[#1a1a1a]">R$ {subtotal.toFixed(2)}</span>
              </div>

              {/* Checkout Button */}
              <button
                onClick={handleCheckout}
                disabled={items.length === 0 || isLoading || isSyncing}
                className="w-full h-[52px] bg-[#1e3a1e] text-[#faf7f2] rounded-[14px] font-bold text-[15px] shadow-[0px_4px_20px_0px_rgba(30,58,30,0.28)] hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading || isSyncing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>Finalizar Compra</span>
                    <span className="opacity-60">→</span>
                    <span>R$ {subtotal.toFixed(2)}</span>
                  </>
                )}
              </button>

              {/* Payment Note */}
              <p className="text-center text-xs text-[#9b9b9b] mt-3">
                ✅ Aceita VA, VR, Pix e Cartão
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
