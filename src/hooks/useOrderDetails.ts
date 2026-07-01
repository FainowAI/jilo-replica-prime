import { useOrders } from "./useOrders";

// ponytail: derive from useOrders() cache instead of a separate fetch —
// customer-orders already returns items + history per order, no extra request needed.
export const useOrderDetails = (orderId: string | undefined) => {
  const { data: orders, isLoading } = useOrders();
  const order = orders?.find((o) => o.id === orderId) ?? null;
  const data = order ? { order, items: order.items, history: order.history } : null;
  return { data, isLoading };
};
