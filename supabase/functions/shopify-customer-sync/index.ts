import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getShopifyAdminToken, forceRefreshShopifyAdminToken } from "../_shared/shopify-admin-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SHOPIFY_STORE_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN")!; // ex: jnutg9-u2.myshopify.com
const SHOPIFY_API_VERSION = Deno.env.get("SHOPIFY_API_VERSION") ?? "2025-10";

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

const CUSTOMER_ADDRESS_CREATE_MUTATION = `
  mutation customerAddressCreate($customerId: ID!, $address: MailingAddressInput!) {
    customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: true) {
      address { id }
      userErrors { field message }
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

/**
 * Faz POST GraphQL para Shopify Admin API com retry automático em 401.
 * Token revogado server-side dispara force refresh + retry uma vez.
 */
async function callShopifyAdmin(payload: object, isRetry = false): Promise<Response> {
  const token = isRetry
    ? await forceRefreshShopifyAdminToken()
    : await getShopifyAdminToken();

  const res = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify(payload),
    }
  );

  if (res.status === 401 && !isRetry) {
    console.warn("[shopify-customer-sync] Got 401, forcing token refresh and retrying");
    return callShopifyAdmin(payload, true);
  }

  return res;
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

    // Se já sincronizado, retorna o ID existente (antes de qualquer outra query —
    // este caminho roda em todo SIGNED_IN via A.1.2, então mantém-se barato).
    if (profile?.shopify_customer_id) {
      return new Response(
        JSON.stringify({
          status: "already_synced",
          shopify_customer_id: profile.shopify_customer_id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Endereço default (tabela separada `addresses`). FAIL-SOFT: erro aqui é ignorado.
    // Só é necessário no caminho de criação do customer.
    const { data: defaultAddress } = await serviceClient
      .from("addresses")
      .select("recipient_name, cep, street, number, complement, neighborhood, city, state")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();

    // 3. Chamar Shopify customerCreate com upsert por email
    // No signup o trigger cria profile vazio; usa o nome do JWT (user_metadata) como fallback.
    const fullNameForShopify = (profile?.full_name && profile.full_name.trim())
      ? profile.full_name
      : (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null);
    const { firstName, lastName } = splitName(fullNameForShopify);

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

    const shopifyRes = await callShopifyAdmin(shopifyPayload);

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

    // A.1.1 (EAP visibilidade de dados): anexa endereço default nativo ao customer.
    // FAIL-SOFT: endereço é incremental; qualquer erro aqui NÃO impede o sync.
    // CPF NUNCA é enviado (sem campo nativo no Shopify — decisão D2 da EAP / LGPD).
    try {
      if (defaultAddress) {
        const address1 = [defaultAddress.street, defaultAddress.number]
          .map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
        const address2 = [defaultAddress.complement, defaultAddress.neighborhood]
          .map((s) => (s ?? "").trim()).filter(Boolean).join(" - ") || null;
        const city = (defaultAddress.city ?? "").trim() || null;
        const provinceCode = (defaultAddress.state ?? "").trim().toUpperCase() || null;
        const zip = (defaultAddress.cep ?? "").trim() || null;

        // Só tenta se tiver o mínimo (rua e CEP). Caso contrário, pula sem erro.
        if (address1 && zip) {
          const addressPayload = {
            query: CUSTOMER_ADDRESS_CREATE_MUTATION,
            variables: {
              customerId: shopifyCustomerId,
              address: {
                address1,
                address2,
                city,
                provinceCode,
                zip,
                countryCode: "BR",
                firstName,
                lastName,
              },
            },
          };
          const addrRes = await callShopifyAdmin(addressPayload);
          if (addrRes.ok) {
            const addrData = await addrRes.json();
            const addrErrors = addrData?.data?.customerAddressCreate?.userErrors ?? [];
            if (addrErrors.length > 0) {
              // NÃO logar o endereço (PII). Apenas os campos com erro de validação.
              console.warn("[shopify-customer-sync] address attach userErrors (ignorado):",
                JSON.stringify(addrErrors.map((e: { field?: string[] }) => e.field)));
            }
          } else {
            console.warn("[shopify-customer-sync] address attach HTTP error (ignorado):", addrRes.status);
          }
        }
      }
    } catch (addrErr) {
      // Fail-soft total: nunca propaga. NÃO logar PII.
      console.warn("[shopify-customer-sync] address attach threw (ignorado)");
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
