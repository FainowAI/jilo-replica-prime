import { useQuery } from "@tanstack/react-query";
import { storefrontApiRequest, PRODUCTS_QUERY, excludeInternalShipping, type ShopifyProduct } from "@/lib/shopify";

export function normalizeSearch(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function useProductSearch(term: string, limit = 6) {
  // ponytail: catálogo é pequeno (~50), então buscamos tudo 1x e filtramos em memória — sem hit de API por tecla, e match parcial/sem-acento que a query tokenizada do Shopify não dá. Upgrade path: se o catálogo crescer muito, migrar para busca server-side paginada.
  const { data, isLoading } = useQuery({
    queryKey: ["catalog-all-products"],
    queryFn: async () => {
      const data = await storefrontApiRequest(PRODUCTS_QUERY, { first: 50, query: excludeInternalShipping() });
      return (data?.data?.products?.edges || []) as ShopifyProduct[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const normalizedTerm = normalizeSearch(term);
  if (normalizedTerm.length < 1) {
    return { results: [] as ShopifyProduct[], isLoading };
  }

  const results = (data || []).filter((p) =>
    normalizeSearch(p.node.title).includes(normalizedTerm) ||
    normalizeSearch(p.node.productType).includes(normalizedTerm)
  ).slice(0, limit);

  return { results, isLoading };
}
