import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHOPIFY_WEBHOOK_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function verifyShopifyHmac(body: string, hmacHeader: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SHOPIFY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const computedHmac = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return computedHmac === hmacHeader;
}

function extractOrderData(payload: any) {
  const totalCents = Math.round(parseFloat(payload.total_price || "0") * 100);
  const subtotalCents = Math.round(parseFloat(payload.subtotal_price || "0") * 100);
  const discountCents = Math.round(
    (payload.total_discounts ? parseFloat(payload.total_discounts) : 0) * 100
  );
  const shippingCents = Math.round(
    (payload.total_shipping_price_set?.shop_money?.amount
      ? parseFloat(payload.total_shipping_price_set.shop_money.amount)
      : 0) * 100
  );

  const lineItems = (payload.line_items || []).map((item: any) => ({
    title: item.title,
    variant_id: item.variant_id?.toString(),
    quantity: item.quantity,
    price_cents: Math.round(parseFloat(item.price || "0") * 100),
  }));

  const discountCode = payload.discount_codes?.[0]?.code || null;
  const paymentMethod = payload.payment_gateway_names?.[0] || null;

  return {
    shopify_order_id: payload.admin_graphql_api_id || `gid://shopify/Order/${payload.id}`,
    shopify_order_number: payload.name || `#${payload.order_number}`,
    customer_email: payload.email || payload.customer?.email || "unknown@email.com",
    customer_name: payload.customer
      ? `${payload.customer.first_name || ""} ${payload.customer.last_name || ""}`.trim()
      : null,
    customer_phone: payload.customer?.phone || payload.shipping_address?.phone || null,
    status: payload.financial_status === "paid" ? "paid" : "pending",
    payment_method: paymentMethod,
    payment_status: payload.financial_status || "pending",
    subtotal_cents: subtotalCents,
    discount_cents: discountCents,
    shipping_cents: shippingCents,
    total_cents: totalCents,
    coupon_code: discountCode,
    line_items: lineItems,
    shipping_address: payload.shipping_address || null,
    notes: payload.note || null,
    shopify_checkout_token: payload.checkout_token || null,
  };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256") || "";
  const topic = req.headers.get("x-shopify-topic") || "";

  // Validate HMAC
  if (SHOPIFY_WEBHOOK_SECRET) {
    const valid = await verifyShopifyHmac(body, hmacHeader);
    if (!valid) {
      console.error("Invalid HMAC signature");
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const payload = JSON.parse(body);
  const externalId = payload.id?.toString() || payload.admin_graphql_api_id || "unknown";

  try {
    // Idempotency check
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("source", "shopify")
      .eq("event_type", topic)
      .eq("external_id", externalId)
      .maybeSingle();

    if (existing) {
      console.log(`Duplicate webhook: ${topic} ${externalId}`);
      return new Response(JSON.stringify({ status: "duplicate" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log webhook event
    await supabase.from("webhook_events").insert({
      source: "shopify",
      event_type: topic,
      external_id: externalId,
      payload: payload,
    });

    // Process by topic
    if (topic === "orders/create") {
      const orderData = extractOrderData(payload);
      await supabase.from("orders").upsert(orderData, {
        onConflict: "shopify_order_id",
      });
    } else if (topic === "orders/paid") {
      const shopifyOrderId = payload.admin_graphql_api_id || `gid://shopify/Order/${payload.id}`;
      await supabase
        .from("orders")
        .update({ payment_status: "paid", status: "paid" })
        .eq("shopify_order_id", shopifyOrderId);
    } else if (topic === "orders/fulfilled") {
      const shopifyOrderId = payload.admin_graphql_api_id || `gid://shopify/Order/${payload.id}`;
      await supabase
        .from("orders")
        .update({ status: "dispatched" })
        .eq("shopify_order_id", shopifyOrderId);
    }

    // Mark as processed
    await supabase
      .from("webhook_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("source", "shopify")
      .eq("event_type", topic)
      .eq("external_id", externalId);

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook processing error:", error);

    // Log error but return 200 to prevent Shopify retries
    await supabase
      .from("webhook_events")
      .update({ error: String(error) })
      .eq("source", "shopify")
      .eq("event_type", topic)
      .eq("external_id", externalId);

    return new Response(JSON.stringify({ status: "error" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
