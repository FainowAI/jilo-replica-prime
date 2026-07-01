import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CustomerOrderItem {
  id: string;
  product_title: string;
  variant_title: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
}

export interface CustomerOrderHistoryEntry {
  id: string;
  to_status: string;
  changed_at: string;
  note: string | null;
}

export interface CustomerOrderShippingAddress {
  recipient_name: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
}

export interface CustomerOrder {
  id: string;
  shopify_order_id: string;
  shopify_order_number: string;
  status: string;
  placed_at: string;
  created_at: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  payment_method: string | null;
  coupon_code: string | null;
  tracking_url: string | null;
  shipping_address: CustomerOrderShippingAddress | null;
  items: CustomerOrderItem[];
  history: CustomerOrderHistoryEntry[];
}

export const useOrders = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["customer-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("customer-orders");
      if (error) throw error;
      return (data?.orders ?? []) as CustomerOrder[];
    },
  });
};
