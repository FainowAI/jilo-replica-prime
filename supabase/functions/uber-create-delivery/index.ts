import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SHIPPING_FREE_THRESHOLD } from "../_shared/shipping-constants.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UBER_CLIENT_ID = Deno.env.get("UBER_CLIENT_ID")!;
const UBER_CLIENT_SECRET = Deno.env.get("UBER_CLIENT_SECRET")!;
const UBER_CUSTOMER_ID = Deno.env.get("UBER_CUSTOMER_ID")!;
const UBER_API_BASE = Deno.env.get("UBER_API_BASE") ?? "https://api.uber.com";
const SHIPPING_VARIANT_GID = Deno.env.get("SHOPIFY_SHIPPING_VARIANT_ID")!;
const JILO_PICKUP_NAME = Deno.env.get("JILO_PICKUP_NAME")!;
const JILO_PICKUP_PHONE = Deno.env.get("JILO_PICKUP_PHONE")!;
const JILO_PICKUP_ADDRESS_JSON = Deno.env.get("JILO_PICKUP_ADDRESS_JSON")!;
const JILO_PICKUP_LATITUDE = parseFloat(Deno.env.get("JILO_PICKUP_LATITUDE")!);
const JILO_PICKUP_LONGITUDE = parseFloat(Deno.env.get("JILO_PICKUP_LONGITUDE")!);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ShopifyShippingAddress {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  province_code?: string;
  zip?: string;
  phone?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  country_code?: string;
}

interface OrderLineItem {
  title: string;
  variant_id?: string;
  quantity: number;
  price_cents: number;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getUberAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  // URL oficial Uber: https://auth.uber.com/oauth/v2/token. Scope: "eats.deliveries". Token vale 30 dias.
  const res = await fetch("https://auth.uber.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: UBER_CLIENT_ID,
      client_secret: UBER_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "eats.deliveries",
    }),
  });
  if (!res.ok) throw new Error(`Uber auth failed: ${res.status}`);
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 2_592_000) * 1000 };
  return cachedToken.value;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Auth: só service role pode chamar
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const { order_id } = (await req.json()) as { order_id: string };

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        "id, uber_quote_id, delivery_method, delivery_status, customer_email, customer_name, customer_phone, shipping_address, line_items"
      )
      .eq("id", order_id)
      .maybeSingle();

    if (orderErr || !order) {
      console.error("Order not found:", order_id, orderErr);
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404 });
    }

    // Validações defensivas
    if (order.delivery_method !== "uber_direct") {
      return new Response(
        JSON.stringify({ status: "skipped", reason: "delivery_method is not uber_direct" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (order.delivery_status !== "pending_dispatch") {
      return new Response(
        JSON.stringify({ status: "already_dispatched", current_status: order.delivery_status }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!order.uber_quote_id) {
      console.error("Missing uber_quote_id for order", order_id);
      await supabase.from("orders").update({ delivery_status: "uber_failed" }).eq("id", order_id);
      return new Response(JSON.stringify({ error: "Missing quote_id" }), { status: 400 });
    }

    const shippingAddr = order.shipping_address as ShopifyShippingAddress | null;
    if (!shippingAddr || !shippingAddr.address1 || !shippingAddr.city) {
      console.error("Invalid shipping_address for order", order_id);
      await supabase.from("orders").update({ delivery_status: "uber_failed" }).eq("id", order_id);
      return new Response(JSON.stringify({ error: "Invalid shipping address" }), { status: 400 });
    }

    // Conta marmitas reais (filtra a variant fantasma)
    const lineItems = (order.line_items as OrderLineItem[]) ?? [];
    const shippingVariantNumeric = SHIPPING_VARIANT_GID.split("/").pop();
    const totalNonShippingItems = lineItems
      .filter((li) => li.variant_id !== shippingVariantNumeric)
      .reduce((sum, li) => sum + (li.quantity ?? 0), 0);

    // Sanity check (defensivo): order classificada como uber_direct não deveria ter ≥ 7
    if (totalNonShippingItems >= SHIPPING_FREE_THRESHOLD) {
      console.warn(
        `Inconsistência: order ${order_id} marcada uber_direct mas tem ${totalNonShippingItems} itens (>= ${SHIPPING_FREE_THRESHOLD}). Despachando mesmo assim.`
      );
    }

    const accessToken = await getUberAccessToken();

    const dropoffStreetAddress = shippingAddr.address2
      ? [shippingAddr.address1, shippingAddr.address2]
      : [shippingAddr.address1!];

    const dropoffAddress = JSON.stringify({
      street_address: dropoffStreetAddress,
      city: shippingAddr.city,
      state: shippingAddr.province_code ?? shippingAddr.province ?? "",
      zip_code: (shippingAddr.zip ?? "").replace(/\D/g, ""),
      country: shippingAddr.country_code ?? "BR",
    });

    const dropoffName =
      shippingAddr.name ??
      ([shippingAddr.first_name, shippingAddr.last_name].filter(Boolean).join(" ") ||
        order.customer_name ||
        "Cliente Jilo");

    const dropoffPhone = shippingAddr.phone ?? order.customer_phone ?? "";

    const deliveryPayload = {
      quote_id: order.uber_quote_id,
      pickup_address: JILO_PICKUP_ADDRESS_JSON,
      pickup_name: JILO_PICKUP_NAME,
      pickup_phone_number: JILO_PICKUP_PHONE,
      pickup_latitude: JILO_PICKUP_LATITUDE,
      pickup_longitude: JILO_PICKUP_LONGITUDE,
      dropoff_address: dropoffAddress,
      dropoff_name: dropoffName,
      dropoff_phone_number: dropoffPhone,
      manifest_items: [
        {
          name: `Pedido Jilo (${totalNonShippingItems} marmitas)`,
          quantity: totalNonShippingItems,
          size: "small",
        },
      ],
      manifest_reference: order.id,
    };

    const deliveryRes = await fetch(
      `${UBER_API_BASE}/v1/customers/${UBER_CUSTOMER_ID}/deliveries`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(deliveryPayload),
      }
    );

    if (!deliveryRes.ok) {
      const errText = await deliveryRes.text();
      console.error("Uber create delivery failed:", deliveryRes.status, errText);
      await supabase.from("orders").update({ delivery_status: "uber_failed" }).eq("id", order_id);
      return new Response(
        JSON.stringify({ error: "Delivery creation failed", status: deliveryRes.status, detail: errText }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const delivery = await deliveryRes.json();

    await supabase
      .from("orders")
      .update({
        uber_delivery_id: delivery.id,
        uber_tracking_url: delivery.tracking_url,
        delivery_status: "uber_pickup_assigned",
      })
      .eq("id", order_id);

    return new Response(
      JSON.stringify({
        status: "created",
        uber_delivery_id: delivery.id,
        tracking_url: delivery.tracking_url,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("uber-create-delivery unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
