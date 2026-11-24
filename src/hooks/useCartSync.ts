import { useEffect } from 'react';
import { toast } from 'sonner';
import { useCartStore } from '@/stores/cartStore';
import { adjustmentMessage } from '@/lib/cartReconcile';

export function useCartSync() {
  const syncCart = useCartStore(state => state.syncCart);
  const cartAdjustments = useCartStore(state => state.cartAdjustments);
  const clearCartAdjustments = useCartStore(state => state.clearCartAdjustments);

  useEffect(() => {
    syncCart();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncCart();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [syncCart]);

  // Único consumidor dos ajustes da conciliação (montado uma vez no App): evita toast
  // duplicado quando /carrinho e CartDrawer estão montados ao mesmo tempo.
  useEffect(() => {
    if (cartAdjustments.length === 0) return;
    for (const adj of cartAdjustments) {
      toast.warning(adjustmentMessage(adj));
    }
    clearCartAdjustments();
  }, [cartAdjustments, clearCartAdjustments]);
}
