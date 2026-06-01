import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getShopifyAdminToken, forceRefreshShopifyAdminToken } from "../_shared/shopify-admin-auth.ts";

const SHOPIFY_STORE_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN")!;
const SHOPIFY_API_VERSION = Deno.env.get("SHOPIFY_API_VERSION") ?? "2025-10";

const SHOPIFY_GRAPHQL_URL = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SetUnlistedRequest {
  product_id: string; // GID format: "gid://shopify/Product/123"
}

// Query pra ler o status atual antes de mudar
const PRODUCT_STATUS_QUERY = `
  query GetProductStatus($id: ID!) {
    product(id: $id) {
      id
      title
      status
    }
  }
`;

// Mutation pra mudar pra unlisted
const PRODUCT_UPDATE_MUTATION = `
  mutation SetProductUnlisted($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        status
      }
      userErrors { field message }
    }
  }
`;

/**
 * Chamada GraphQL para Shopify Admin API com retry em 401.
 */
async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  isRetry = false
): Promise<T> {
  const token = isRetry
    ? await forceRefreshShopifyAdminToken()
    : await getShopifyAdminToken();

  const res = await fetch(SHOPIFY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 401 && !isRetry) {
    console.warn("[set-product-unlisted] Got 401, forcing token refresh and retrying");
    return shopifyGraphQL<T>(query, variables, true);
  }

  if (!res.ok) {
    throw new Error(`Shopify HTTP ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: SetUnlistedRequest = await req.json();

    if (!body.product_id || typeof body.product_id !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid product_id (must be GID string)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body.product_id.startsWith("gid://shopify/Product/")) {
      return new Response(
        JSON.stringify({ error: "product_id must be in GID format: gid://shopify/Product/123" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Lê status atual (idempotência)
    const currentData = await shopifyGraphQL<{
      product: { id: string; title: string; status: string } | null;
    }>(PRODUCT_STATUS_QUERY, { id: body.product_id });

    if (!currentData.product) {
      return new Response(
        JSON.stringify({ error: "Product not found", product_id: body.product_id }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentStatus = currentData.product.status;
    console.log(
      `[set-product-unlisted] Current status of "${currentData.product.title}": ${currentStatus}`
    );

    // 2. Se já está unlisted, retorna sucesso sem operar
    if (currentStatus === "UNLISTED") {
      return new Response(
        JSON.stringify({
          status: "already_unlisted",
          product_id: body.product_id,
          title: currentData.product.title,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Muda pra unlisted via productUpdate
    const updateData = await shopifyGraphQL<{
      productUpdate: {
        product: { id: string; title: string; status: string } | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(PRODUCT_UPDATE_MUTATION, {
      input: {
        id: body.product_id,
        status: "UNLISTED",
      },
    });

    const userErrors = updateData.productUpdate.userErrors;
    if (userErrors.length > 0) {
      console.error("[set-product-unlisted] userErrors:", userErrors);
      return new Response(
        JSON.stringify({ error: "Update failed", detail: userErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const updatedStatus = updateData.productUpdate.product?.status;
    console.log(
      `[set-product-unlisted] Status changed: ${currentStatus} → ${updatedStatus}`
    );

    return new Response(
      JSON.stringify({
        status: "updated",
        product_id: body.product_id,
        title: updateData.productUpdate.product?.title,
        previous_status: currentStatus,
        new_status: updatedStatus,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[set-product-unlisted] unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
