import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { SHIPPING_FREE_THRESHOLD } from "../_shared/shipping-constants.ts";

const SHOPIFY_SHIPPING_VARIANT_GID = Deno.env.get("SHOPIFY_SHIPPING_VARIANT_ID") ?? "";

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

function getShippingVariantNumericId(): string | null {
  if (!SHOPIFY_SHIPPING_VARIANT_GID) return null;
  return SHOPIFY_SHIPPING_VARIANT_GID.split("/").pop() ?? null;
}

function extractDeliveryAttributes(payload: any): {
  uber_quote_id: string | null;
  delivery_method_hint: string | null;
} {
  const noteAttributes = payload.note_attributes ?? [];
  const findAttr = (name: string): string | null => {
    const attr = noteAttributes.find((a: { name: string; value: string }) => a.name === name);
    return attr?.value ?? null;
  };
  return {
    uber_quote_id: findAttr("uber_quote_id"),
    delivery_method_hint: findAttr("delivery_method"),
  };
}

function calculateNonShippingItemsTotal(lineItems: any[]): number {
  const shippingNumericId = getShippingVariantNumericId();
  return lineItems
    .filter((item) => {
      if (!shippingNumericId) return true;
      return String(item.variant_id) !== shippingNumericId;
    })
    .reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

function findShippingFeeCents(lineItems: any[]): number {
  const shippingNumericId = getShippingVariantNumericId();
  if (!shippingNumericId) return 0;
  const shippingItem = lineItems.find(
    (item) => String(item.variant_id) === shippingNumericId
  );
  if (!shippingItem) return 0;
  const unitCents = Math.round(parseFloat(shippingItem.price ?? "0") * 100);
  return unitCents * (shippingItem.quantity ?? 1);
}

function extractOrderItems(payload: any): any[] {
  const shippingNumericId = getShippingVariantNumericId();
  const lineItems = payload.line_items ?? [];
  return lineItems
    .filter((item: any) => {
      if (!shippingNumericId) return true;
      return String(item.variant_id) !== shippingNumericId; // exclui a variant fantasma de frete
    })
    .map((item: any) => {
      const qty = item.quantity ?? 1;
      const unitCents = Math.round(parseFloat(item.price ?? "0") * 100);
      // properties do Shopify vêm como array [{name,value}] — normaliza p/ objeto jsonb
      const props = Array.isArray(item.properties)
        ? item.properties.reduce((acc: Record<string, unknown>, p: any) => {
            if (p && typeof p.name === "string") acc[p.name] = p.value;
            return acc;
          }, {})
        : {};
      return {
        shopify_line_item_id: item.id?.toString() ?? null,
        shopify_variant_id: item.variant_id?.toString() ?? null,
        shopify_product_id: item.product_id?.toString() ?? null,
        product_handle: null, // REST order payload não traz handle
        product_title: item.title || "Item",
        variant_title: item.variant_title ?? null,
        quantity: qty,
        unit_price_cents: Math.max(0, unitCents),
        line_total_cents: Math.max(0, unitCents * qty),
        properties: props,
      };
    })
    .filter((row: any) => row.quantity > 0); // order_items_quantity_check exige quantity > 0
}

async function syncOrderItems(orderId: string, payload: any): Promise<void> {
  const items = extractOrderItems(payload).map((it) => ({ ...it, order_id: orderId }));
  // limpa itens antigos desse pedido antes de reinserir (idempotência)
  await supabase.from("order_items").delete().eq("order_id", orderId);
  if (items.length > 0) {
    const { error } = await supabase.from("order_items").insert(items);
    if (error) console.error("Failed to insert order_items:", error);
  }
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
      const { data: createdOrder } = await supabase
        .from("orders")
        .upsert(orderData, { onConflict: "shopify_order_id" })
        .select("id")
        .maybeSingle();
      if (createdOrder?.id) {
        await syncOrderItems(createdOrder.id, payload);
      }
    } else if (topic === "orders/paid") {
      const lineItems = payload.line_items ?? [];

      const totalNonShippingItems = calculateNonShippingItemsTotal(lineItems);
      const { uber_quote_id, delivery_method_hint } = extractDeliveryAttributes(payload);

      const deliveryMethod: "uber_direct" | "jilo_own" | "lalamove" =
        delivery_method_hint === "lalamove"
          ? "lalamove"
          : totalNonShippingItems >= SHIPPING_FREE_THRESHOLD
            ? "jilo_own"
            : "uber_direct";
      const shippingFeeCents = findShippingFeeCents(lineItems);
      const initialDeliveryStatus =
        deliveryMethod === "uber_direct" ? "pending_dispatch"
        : deliveryMethod === "lalamove"  ? "lalamove_pending"
        : "jilo_pending"; // jilo_own

      const baseOrderData = extractOrderData(payload);
      const { data: updatedOrder, error: updateErr } = await supabase
        .from("orders")
        .upsert(
          {
            ...baseOrderData,
            payment_status: "paid",
            status: "paid",
            delivery_method: deliveryMethod,
            uber_quote_id,
            shipping_fee_cents: shippingFeeCents,
            delivery_status: initialDeliveryStatus,
          },
          { onConflict: "shopify_order_id" }
        )
        .select("id")
        .maybeSingle();

      if (updateErr) {
        console.error("Failed to update order on paid event:", updateErr);
      }

      // Sincroniza order_items (cobre o caso de paid criar a linha antes de create chegar)
      if (updatedOrder?.id) {
        await syncOrderItems(updatedOrder.id, payload);
      }

      // Dispatch Uber se aplicável (fire-and-forget — webhook tem timeout curto)
      if (
        updatedOrder?.id &&
        deliveryMethod === "uber_direct" &&
        uber_quote_id
      ) {
        const dispatchUrl = `${SUPABASE_URL}/functions/v1/uber-create-delivery`;
        fetch(dispatchUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ order_id: updatedOrder.id }),
        }).catch((err) =>
          console.error("uber-create-delivery dispatch failed:", err)
        );
      } else if (deliveryMethod === "uber_direct" && !uber_quote_id) {
        console.warn(
          `Order ${updatedOrder?.id} é uber_direct mas não tem uber_quote_id — admin precisa intervir manualmente`
        );
      }
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
