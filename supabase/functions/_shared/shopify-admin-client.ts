/**
 * `callShopifyAdmin<T>(query, variables)` — extraído do padrão repetido em
 * `customer-orders/index.ts` e `shopify-webhook-receiver/index.ts`: POST
 * GraphQL na Admin API com retry único em 401 via
 * `forceRefreshShopifyAdminToken`. NÃO altera as functions existentes —
 * elas continuam com sua cópia local; esta é a versão compartilhada usada
 * pelos módulos novos do pagamento VR (ticket 03).
 *
 * Erros lançados são sempre mensagens curtas do vocabulário interno (nunca
 * o corpo da resposta) — quem chama grava `error` em `vr_transactions` sem
 * risco de colar PII (userErrors da Shopify podem conter endereço).
 */
import { forceRefreshShopifyAdminToken, getShopifyAdminToken } from "./shopify-admin-auth.ts";

const SHOPIFY_STORE_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN")!;
const SHOPIFY_API_VERSION = Deno.env.get("SHOPIFY_API_VERSION") ?? "2025-10";

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function callShopifyAdminInternal<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  isRetry: boolean,
): Promise<T> {
  const token = isRetry ? await forceRefreshShopifyAdminToken() : await getShopifyAdminToken();

  const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 401 && !isRetry) {
    console.warn("[shopify-admin-client] 401, forcing token refresh and retrying");
    return callShopifyAdminInternal<T>(query, variables, true);
  }

  if (!res.ok) {
    console.error(`[shopify-admin-client] HTTP ${res.status}`);
    throw new Error(`shopify_admin_http_${res.status}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors && json.errors.length > 0) {
    console.error(`[shopify-admin-client] GraphQL errors (${json.errors.length})`);
    throw new Error("shopify_admin_graphql_errors");
  }
  if (json.data === undefined) {
    throw new Error("shopify_admin_bad_response");
  }
  return json.data;
}

/** POST GraphQL na Admin API com retry único em 401. Lança Error curto (nunca o body) em falha. */
export async function callShopifyAdmin<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return await callShopifyAdminInternal<T>(query, variables, false);
}
