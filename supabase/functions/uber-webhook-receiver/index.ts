import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Mapeia status da Uber para nosso enum delivery_status
const UBER_STATUS_MAP: Record<string, string> = {
  pickup: "uber_pickup_assigned",
  pickup_complete: "uber_pickup_complete",
  dropoff: "uber_in_transit",
  delivered: "uber_dropoff_complete",
  canceled: "uber_failed",
  returned: "uber_failed",
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  console.log("Uber webhook received, kind:", payload.kind);

  const deliveryId = payload.data?.id ?? payload.delivery_id ?? "unknown";
  const uberStatus = payload.data?.status ?? payload.status ?? "unknown";
  const eventType = payload.kind ?? "uber_unknown";
  const externalId = `${deliveryId}:${uberStatus}`;

  try {
    // Idempotência por (source, event_type, external_id)
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("source", "uber_direct")
      .eq("event_type", eventType)
      .eq("external_id", externalId)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ status: "duplicate" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    await supabase.from("webhook_events").insert({
      source: "uber_direct",
      event_type: eventType,
      external_id: externalId,
      payload,
    });

    // Só processamos eventos de status de entrega
    if (eventType !== "event.delivery_status") {
      await supabase
        .from("webhook_events")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("source", "uber_direct")
        .eq("event_type", eventType)
        .eq("external_id", externalId);
      return new Response(JSON.stringify({ status: "ignored", kind: eventType }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (deliveryId === "unknown" || uberStatus === "unknown") {
      return new Response(
        JSON.stringify({ error: "Missing delivery_id or status" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const internalStatus = UBER_STATUS_MAP[uberStatus] ?? "uber_in_transit";

    const { error: updateErr } = await supabase
      .from("orders")
      .update({ delivery_status: internalStatus })
      .eq("uber_delivery_id", deliveryId);

    if (updateErr) {
      console.error("Failed to update delivery_status:", updateErr);
      // Loga erro mas retorna 200 pra Uber não tentar reentregar
      await supabase
        .from("webhook_events")
        .update({ error: updateErr.message })
        .eq("source", "uber_direct")
        .eq("event_type", eventType)
        .eq("external_id", externalId);
      return new Response(
        JSON.stringify({ status: "error", detail: updateErr.message }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("webhook_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("source", "uber_direct")
      .eq("event_type", eventType)
      .eq("external_id", externalId);

    return new Response(
      JSON.stringify({ status: "updated", delivery_status: internalStatus }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("uber-webhook-receiver unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 200, // 200 pra Uber não retentar
      headers: { "Content-Type": "application/json" },
    });
  }
});
