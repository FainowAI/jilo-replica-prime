import { supabase } from "@/integrations/supabase/client";

export interface UberQuote {
  quote_id: string;
  fee_cents: number;
  currency: string;
  duration_minutes: number;
  expires_at: string;
  dropoff_eta: string;
}

export interface QuoteParams {
  dropoff_cep: string;
  dropoff_address: string;
  dropoff_city: string;
  dropoff_state: string;
}

export async function fetchUberQuote(params: QuoteParams): Promise<UberQuote> {
  const { data, error } = await supabase.functions.invoke<UberQuote>("uber-quote", {
    body: params,
  });
  if (error) throw error;
  if (!data) throw new Error("Empty response from uber-quote");
  return data;
}

export async function updateShippingVariantPrice(feeCents: number): Promise<void> {
  const { error } = await supabase.functions.invoke("update-shipping-variant-price", {
    body: { fee_cents: feeCents },
  });
  if (error) throw error;
}
