import { useQuery } from "@tanstack/react-query";
import { fetchUberQuote, type UberQuote, type QuoteParams } from "@/lib/uberDirect";
import { isFreeShipping } from "@/config/shipping";

export interface UseShippingQuoteResult {
  isFree: boolean;
  quote: UberQuote | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Cota frete via Uber Direct. Não dispara se totalItems >= threshold (frete grátis)
 * ou se o CEP não foi verificado.
 *
 * Cache: staleTime 14min (cotação válida por 15min).
 */
export function useShippingQuote(
  totalNonShippingItems: number,
  cepInfo: QuoteParams | null
): UseShippingQuoteResult {
  const free = isFreeShipping(totalNonShippingItems);
  const enabled = !free && totalNonShippingItems > 0 && cepInfo !== null;

  const query = useQuery({
    queryKey: [
      "uber-quote",
      cepInfo?.dropoff_cep,
      cepInfo?.dropoff_city,
      totalNonShippingItems,
    ],
    queryFn: () => fetchUberQuote(cepInfo!),
    enabled,
    staleTime: 14 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });

  return {
    isFree: free,
    quote: query.data ?? null,
    loading: query.isFetching,
    error: query.error as Error | null,
    refetch: () => query.refetch(),
  };
}
