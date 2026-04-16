import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useOrderDetails = (orderId: string | undefined) => {
  return useQuery({
    queryKey: ["order", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      if (!orderId) return null;

      const [orderRes, itemsRes, historyRes] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId).maybeSingle(),
        supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
        supabase.from("order_status_history").select("*").eq("order_id", orderId).order("changed_at"),
      ]);

      if (orderRes.error) throw orderRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (historyRes.error) throw historyRes.error;

      if (!orderRes.data) return null;

      return {
        order: orderRes.data,
        items: itemsRes.data ?? [],
        history: historyRes.data ?? [],
      };
    },
  });
};
