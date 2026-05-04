import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SHOPIFY_ADMIN_ACCESS_TOKEN = Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN")!;
const SHOPIFY_STORE_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN")!;
const SHOPIFY_API_VERSION = Deno.env.get("SHOPIFY_API_VERSION") ?? "2025-10";
const SHIPPING_VARIANT_GID = Deno.env.get("SHOPIFY_SHIPPING_VARIANT_ID")!;

const SHOPIFY_GRAPHQL_URL = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface UpdatePriceRequest {
  fee_cents: number;
}

// Cache do productId no isolate (não muda entre invocations)
let cachedProductGid: string | null = null;

const VARIANT_PRODUCT_QUERY = `
  query GetProductOfVariant($id: ID!) {
    productVariant(id: $id) {
      id
      product { id }
    }
  }
`;

const VARIANT_BULK_UPDATE_MUTATION = `
  mutation UpdateShippingVariantPrice(
    $productId: ID!,
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }
`;

async function shopifyGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(SHOPIFY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Shopify HTTP ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data as T;
}

async function resolveProductGid(variantGid: string): Promise<string> {
  if (cachedProductGid) return cachedProductGid;

  const data = await shopifyGraphQL<{
    productVariant: { product: { id: string } } | null;
  }>(VARIANT_PRODUCT_QUERY, { id: variantGid });

  if (!data.productVariant?.product?.id) {
    throw new Error(`Variant ${variantGid} not found or has no product`);
  }

  cachedProductGid = data.productVariant.product.id;
  return cachedProductGid;
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
    const body: UpdatePriceRequest = await req.json();

    // Validação defensiva: 0 < fee_cents <= 100000 (R$ 1000 max)
    if (
      typeof body.fee_cents !== "number" ||
      body.fee_cents < 1 ||
      body.fee_cents > 100_000 ||
      !Number.isInteger(body.fee_cents)
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid fee_cents (must be integer 1..100000)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const productGid = await resolveProductGid(SHIPPING_VARIANT_GID);
    const priceReais = (body.fee_cents / 100).toFixed(2);

    const data = await shopifyGraphQL<{
      productVariantsBulkUpdate: {
        productVariants: Array<{ id: string; price: string }> | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(VARIANT_BULK_UPDATE_MUTATION, {
      productId: productGid,
      variants: [{ id: SHIPPING_VARIANT_GID, price: priceReais }],
    });

    const userErrors = data.productVariantsBulkUpdate.userErrors;
    if (userErrors.length > 0) {
      console.error("productVariantsBulkUpdate userErrors:", userErrors);
      return new Response(
        JSON.stringify({ error: "Variant update failed", detail: userErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        variant_id: SHIPPING_VARIANT_GID,
        price: priceReais,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("update-shipping-variant-price unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
