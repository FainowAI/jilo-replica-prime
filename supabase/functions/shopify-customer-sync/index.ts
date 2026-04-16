import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SHOPIFY_ADMIN_ACCESS_TOKEN = Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN")!;
const SHOPIFY_STORE_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN")!; // ex: jnutg9-u2.myshopify.com
const SHOPIFY_API_VERSION = Deno.env.get("SHOPIFY_API_VERSION") ?? "2025-10";

// Headers CORS — necessários pq a function é chamada do browser
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CUSTOMER_UPSERT_MUTATION = `
  mutation customerCreate($input: CustomerInput!, $identifier: CustomerIdentifierInput) {
    customerCreate(input: $input, identifier: $identifier) {
      customer {
        id
        email
        firstName
        lastName
        phone
        tags
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface ShopifyCustomerResponse {
  data?: {
    customerCreate?: {
      customer?: { id: string; email: string; firstName?: string; lastName?: string };
      userErrors?: { field?: string[]; message: string }[];
    };
  };
  errors?: { message: string }[];
}

function splitName(fullName: string | null | undefined): { firstName: string | null; lastName: string | null } {
  if (!fullName || !fullName.trim()) return { firstName: null, lastName: null };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

serve(async (req) => {
  // Preflight CORS
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
    // 1. Validar JWT e extrair user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user || !user.email) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Buscar profile via service_role (fonte única de verdade para nome/telefone)
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("full_name, phone, shopify_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      return new Response(JSON.stringify({ error: "Profile fetch failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se já sincronizado, retorna o ID existente
    if (profile?.shopify_customer_id) {
      return new Response(
        JSON.stringify({
          status: "already_synced",
          shopify_customer_id: profile.shopify_customer_id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Chamar Shopify customerCreate com upsert por email
    const { firstName, lastName } = splitName(profile?.full_name);

    const shopifyPayload = {
      query: CUSTOMER_UPSERT_MUTATION,
      variables: {
        input: {
          email: user.email,
          firstName,
          lastName,
          phone: profile?.phone || null,
          tags: ["jilo-customer", "source:supabase"],
          note: `Sincronizado do Supabase em ${new Date().toISOString()}`,
        },
        identifier: {
          emailAddress: user.email,
        },
      },
    };

    const shopifyRes = await fetch(
      `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
        },
        body: JSON.stringify(shopifyPayload),
      }
    );

    if (!shopifyRes.ok) {
      const errorBody = await shopifyRes.text();
      console.error("Shopify HTTP error:", shopifyRes.status, errorBody);
      return new Response(
        JSON.stringify({ error: "Shopify API error", status: shopifyRes.status, detail: errorBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shopifyData: ShopifyCustomerResponse = await shopifyRes.json();

    // GraphQL errors (schema, auth)
    if (shopifyData.errors && shopifyData.errors.length > 0) {
      console.error("Shopify GraphQL errors:", shopifyData.errors);
      return new Response(
        JSON.stringify({ error: "GraphQL error", detail: shopifyData.errors }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // userErrors (validação de dados)
    const userErrors = shopifyData.data?.customerCreate?.userErrors ?? [];
    if (userErrors.length > 0) {
      console.error("Shopify userErrors:", userErrors);
      return new Response(
        JSON.stringify({ error: "Validation error", detail: userErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shopifyCustomerId = shopifyData.data?.customerCreate?.customer?.id;
    if (!shopifyCustomerId) {
      return new Response(
        JSON.stringify({ error: "No customer ID returned from Shopify" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Atualizar profile com o shopify_customer_id
    const { error: updateError } = await serviceClient
      .from("profiles")
      .update({ shopify_customer_id: shopifyCustomerId })
      .eq("id", user.id);

    if (updateError) {
      console.error("Profile update error:", updateError);
      return new Response(
        JSON.stringify({
          error: "Customer created on Shopify but profile update failed",
          shopify_customer_id: shopifyCustomerId,
          detail: updateError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        status: "synced",
        shopify_customer_id: shopifyCustomerId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
