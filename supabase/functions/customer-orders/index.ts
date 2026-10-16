import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getShopifyAdminToken, forceRefreshShopifyAdminToken } from "../_shared/shopify-admin-auth.ts";
import { verifiedCustomerNumericId } from "./ownership.ts";

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

const CUSTOMER_ORDERS_QUERY = `
  query CustomerOrders($q: String!) {
    orders(first: 50, query: $q, sortKey: CREATED_AT, reverse: true) {
      edges { node {
        id
        name
        createdAt
        cancelledAt
        displayFinancialStatus
        displayFulfillmentStatus
        paymentGatewayNames
        discountCode
        subtotalPriceSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        currentTotalPriceSet { shopMoney { amount } }
        shippingAddress { name address1 address2 city provinceCode zip }
        lineItems(first: 50) { edges { node { id title quantity variantTitle originalTotalSet { shopMoney { amount } } } } }
        fulfillments(first: 5) { createdAt trackingInfo { number url company } }
      } }
    }
  }
`;

const CUSTOMER_EMAIL_QUERY = `
  query CustomerOwnerEmail($id: ID!) {
    customer(id: $id) { id email }
  }
`;

interface ShopifyMoney {
  shopMoney: { amount: string };
}

interface ShopifyLineItem {
  id: string;
  title: string;
  quantity: number;
  variantTitle: string | null;
  originalTotalSet: ShopifyMoney;
}

interface ShopifyFulfillment {
  createdAt: string;
  trackingInfo: { number: string | null; url: string | null; company: string | null }[];
}

interface ShopifyOrderNode {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  paymentGatewayNames: string[];
  discountCode: string | null;
  subtotalPriceSet: ShopifyMoney;
  totalDiscountsSet: ShopifyMoney;
  currentTotalPriceSet: ShopifyMoney;
  shippingAddress: {
    name: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    provinceCode: string | null;
    zip: string | null;
  } | null;
  lineItems: { edges: { node: ShopifyLineItem }[] };
  fulfillments: ShopifyFulfillment[];
}

interface ShopifyOrdersResponse {
  data?: {
    orders?: { edges: { node: ShopifyOrderNode }[] };
  };
  errors?: { message: string }[];
}

type MappedStatus = "pending" | "paid" | "dispatched" | "cancelled" | "refunded";

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
    console.warn("[customer-orders] Got 401, forcing token refresh and retrying");
    return callShopifyAdmin(payload, true);
  }

  return res;
}

async function lookupCustomerEmail(id: string): Promise<{ id: string; email: string | null } | null> {
  const res = await callShopifyAdmin({ query: CUSTOMER_EMAIL_QUERY, variables: { id } });
  if (!res.ok) return null;
  const body = await res.json() as {
    data?: { customer?: { id: string; email: string | null } | null };
    errors?: unknown[];
  };
  return body.errors?.length ? null : body.data?.customer ?? null;
}

function toCents(amount: string | undefined | null): number {
  return Math.round(parseFloat(amount || "0") * 100);
}

// ponytail: parte numérica extraída do fim do GID ("gid://shopify/Order/123" → "123")
function idFromGid(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1];
}

function deriveStatus(node: ShopifyOrderNode): MappedStatus {
  if (node.cancelledAt) return "cancelled";
  if (node.displayFinancialStatus === "REFUNDED" || node.displayFinancialStatus === "PARTIALLY_REFUNDED") {
    return "refunded";
  }
  if (node.displayFinancialStatus === "EXPIRED" || node.displayFinancialStatus === "VOIDED") {
    return "cancelled";
  }
  if (node.displayFulfillmentStatus === "FULFILLED") return "dispatched";
  if (node.displayFinancialStatus === "PAID") return "paid";
  return "pending";
}

function mapOrder(node: ShopifyOrderNode) {
  const id = idFromGid(node.id);
  const status = deriveStatus(node);
  const firstFulfillment = node.fulfillments?.[0] ?? null;
  const firstTracking = firstFulfillment?.trackingInfo?.[0] ?? null;

  const items = node.lineItems.edges.map(({ node: li }) => {
    const lineTotalCents = toCents(li.originalTotalSet?.shopMoney?.amount);
    // ponytail: unit_price derivado do total da linha (Shopify não expõe preço unitário direto aqui)
    const unitPriceCents = li.quantity > 0 ? Math.round(lineTotalCents / li.quantity) : 0;
    const variantTitle =
      li.variantTitle && li.variantTitle !== "Default Title" ? li.variantTitle : null;
    return {
      id: idFromGid(li.id),
      product_title: li.title,
      variant_title: variantTitle,
      quantity: li.quantity,
      unit_price_cents: unitPriceCents,
      line_total_cents: lineTotalCents,
    };
  });

  const shippingAddress = node.shippingAddress
    ? {
        recipient_name: node.shippingAddress.name ?? null,
        street: node.shippingAddress.address1 ?? null,
        number: null, // ponytail: Shopify não separa número do logradouro
        complement: node.shippingAddress.address2 ?? null,
        neighborhood: null, // ponytail: Shopify não tem campo de bairro nativo
        city: node.shippingAddress.city ?? null,
        state: node.shippingAddress.provinceCode ?? null,
        cep: node.shippingAddress.zip ?? null,
      }
    : null;

  const history: { id: string; to_status: string; changed_at: string; note: string | null }[] = [
    { id: `${id}-placed`, to_status: "pending", changed_at: node.createdAt, note: "Pedido recebido" },
  ];

  if (
    status === "paid" ||
    status === "dispatched" ||
    status === "refunded" ||
    node.displayFinancialStatus === "PAID"
  ) {
    history.push({ id: `${id}-paid`, to_status: "paid", changed_at: node.createdAt, note: "Pagamento confirmado" });
  }

  if (firstFulfillment) {
    const trackingNote =
      firstTracking && (firstTracking.company || firstTracking.number)
        ? `Rastreio: ${[firstTracking.company, firstTracking.number].filter(Boolean).join(" ")}`
        : "Pedido enviado";
    history.push({
      id: `${id}-fulfilled`,
      to_status: "dispatched",
      changed_at: firstFulfillment.createdAt ?? node.createdAt,
      note: trackingNote,
    });
  }

  if (status === "refunded") {
    history.push({ id: `${id}-refunded`, to_status: "refunded", changed_at: node.createdAt, note: "Reembolsado" });
  }

  if (node.cancelledAt) {
    history.push({
      id: `${id}-cancelled`,
      to_status: "cancelled",
      changed_at: node.cancelledAt,
      note: "Pedido cancelado",
    });
  }

  return {
    id,
    shopify_order_id: id,
    shopify_order_number: node.name.replace(/^#/, ""),
    status,
    placed_at: node.createdAt,
    created_at: node.createdAt,
    subtotal_cents: toCents(node.subtotalPriceSet?.shopMoney?.amount),
    discount_cents: toCents(node.totalDiscountsSet?.shopMoney?.amount),
    total_cents: toCents(node.currentTotalPriceSet?.shopMoney?.amount),
    payment_method: node.paymentGatewayNames?.[0] ?? null,
    coupon_code: node.discountCode ?? null,
    tracking_url: firstTracking?.url ?? null,
    shipping_address: shippingAddress,
    items,
    history,
  };
}

// Rejeita metacaracteres da DSL de busca da Shopify (espaço, aspas, ':', '()',
// wildcards, quebras de linha) para fechar injeção de termo.
function isSafeEmail(email: string): boolean {
  return !/["'\s:()*?]/.test(email) && !/[\r\n]/.test(email);
}

type OrdersResult =
  | { ok: true; orders: ReturnType<typeof mapOrder>[] }
  | { ok: false; error: string };

async function fetchOrders(searchQuery: string): Promise<OrdersResult> {
  const shopifyRes = await callShopifyAdmin({
    query: CUSTOMER_ORDERS_QUERY,
    variables: { q: searchQuery },
  });

  if (!shopifyRes.ok) {
    const errorBody = await shopifyRes.text();
    console.error("Shopify HTTP error:", shopifyRes.status, errorBody);
    // ponytail: detalhe fica só no log do servidor; cliente recebe genérico.
    return { ok: false, error: "Shopify API error" };
  }

  const shopifyData: ShopifyOrdersResponse = await shopifyRes.json();
  if (shopifyData.errors && shopifyData.errors.length > 0) {
    console.error("Shopify GraphQL errors:", shopifyData.errors);
    return { ok: false, error: "GraphQL error" };
  }

  const edges = shopifyData.data?.orders?.edges ?? [];
  return { ok: true, orders: edges.map(({ node }) => mapOrder(node)) };
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

    // 2. Montar o filtro de busca amarrado à identidade do JWT.
    // O GID do perfil só é aceito se a Shopify confirmar que pertence ao mesmo e-mail.
    if (!isSafeEmail(user.email)) {
      return new Response(JSON.stringify({ error: "Invalid user email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("shopify_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    // ponytail: 2 queries no pior caso; unificar com OR na DSL se virar gargalo
    let result: OrdersResult;
    const customerNumericId = await verifiedCustomerNumericId(
      profile?.shopify_customer_id,
      user.email,
      lookupCustomerEmail,
    );
    if (customerNumericId) {
      result = await fetchOrders(`customer_id:${customerNumericId}`);
      // Pedido feito como guest com o mesmo e-mail não tem customer_id: cai no e-mail.
      if (result.ok && !result.orders.length) {
        result = await fetchOrders(`email:${user.email}`);
      }
    } else {
      result = await fetchOrders(`email:${user.email}`);
    }

    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const orders = result.orders;

    return new Response(
      JSON.stringify({ orders }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
