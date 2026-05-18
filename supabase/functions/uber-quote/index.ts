import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const UBER_CLIENT_ID = Deno.env.get("UBER_CLIENT_ID")!;
const UBER_CLIENT_SECRET = Deno.env.get("UBER_CLIENT_SECRET")!;
const UBER_CUSTOMER_ID = Deno.env.get("UBER_CUSTOMER_ID")!;
const UBER_API_BASE = Deno.env.get("UBER_API_BASE") ?? "https://api.uber.com";

const JILO_PICKUP_ADDRESS_JSON = Deno.env.get("JILO_PICKUP_ADDRESS_JSON")!;
const JILO_PICKUP_LATITUDE = parseFloat(Deno.env.get("JILO_PICKUP_LATITUDE")!);
const JILO_PICKUP_LONGITUDE = parseFloat(Deno.env.get("JILO_PICKUP_LONGITUDE")!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface QuoteRequest {
  dropoff_cep: string;
  dropoff_address: string;
  dropoff_city: string;
  dropoff_state: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getUberAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  // URL oficial Uber: https://auth.uber.com/oauth/v2/token (NÃO login.uber.com)
  // Scope correto e único para Uber Direct: "eats.deliveries"
  // Token retornado vale 30 dias (expires_in: 2592000s) — cacheamos por isolate
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

  if (!res.ok) {
    throw new Error(`Uber auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 2_592_000) * 1000,
  };
  return cachedToken.value;
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
    const body: QuoteRequest = await req.json();

    if (!body.dropoff_cep || !body.dropoff_address || !body.dropoff_city || !body.dropoff_state) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: dropoff_cep, dropoff_address, dropoff_city, dropoff_state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getUberAccessToken();

    const dropoffAddress = JSON.stringify({
      street_address: [body.dropoff_address],
      city: body.dropoff_city,
      state: body.dropoff_state,
      zip_code: body.dropoff_cep.replace(/\D/g, ""),
      country: "BR",
    });

    const quotePayload = {
      pickup_address: JILO_PICKUP_ADDRESS_JSON,
      pickup_latitude: JILO_PICKUP_LATITUDE,
      pickup_longitude: JILO_PICKUP_LONGITUDE,
      dropoff_address: dropoffAddress,
    };

    console.log("uber-quote payload:", JSON.stringify({
      endpoint: `${UBER_API_BASE}/v1/customers/${UBER_CUSTOMER_ID}/delivery_quotes`,
      payload: quotePayload,
    }));

    const quoteRes = await fetch(
      `${UBER_API_BASE}/v1/customers/${UBER_CUSTOMER_ID}/delivery_quotes`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(quotePayload),
      }
    );

    if (!quoteRes.ok) {
      const errText = await quoteRes.text();
      console.error("Uber quote failed:", {
        status: quoteRes.status,
        body: errText,
        sent_payload: quotePayload,
      });
      return new Response(
        JSON.stringify({ error: "Quote failed", status: quoteRes.status, detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const quote = await quoteRes.json();

    return new Response(
      JSON.stringify({
        quote_id: quote.id,
        fee_cents: quote.fee,
        currency: quote.currency,
        duration_minutes: quote.duration,
        expires_at: quote.expires,
        dropoff_eta: quote.dropoff_eta,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("uber-quote unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
