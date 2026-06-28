import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHOPIFY_STORE_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN")!;
const SHOPIFY_API_VERSION = Deno.env.get("SHOPIFY_API_VERSION") ?? "2025-10";
const SHOPIFY_CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID")!;
const SHOPIFY_CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET")!;

const TOPICS = ["ORDERS_CREATE", "ORDERS_PAID", "ORDERS_FULFILLED"] as const;

const EXISTING_QUERY = `query existingWebhooks {
  webhookSubscriptions(first: 50) {
    edges { node { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } }
  }
}`;

const CREATE_MUTATION = `mutation registerWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription { id topic }
    userErrors { field message }
  }
}`;

async function mintAdminToken(): Promise<string> {
  const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
    }).toString(),
  });
  if (!res.ok) throw new Error(`OAuth token mint failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("OAuth response missing access_token");
  return data.access_token as string;
}

async function shopifyGraphql(token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    },
  );
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }
  // Guard: exige service-role bearer
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const callbackUrl = `${SUPABASE_URL}/functions/v1/shopify-webhook-receiver`;
  const report = { callbackUrl, created: [] as string[], existing: [] as string[], errors: [] as unknown[] };

  try {
    const adminToken = await mintAdminToken();

    // 1) lista existentes
    const existing = await shopifyGraphql(adminToken, EXISTING_QUERY);
    if (existing.json?.errors) {
      return new Response(JSON.stringify({ error: "Failed to list webhooks", detail: existing.json.errors }), { status: 502, headers: { "Content-Type": "application/json" } });
    }
    const edges = existing.json?.data?.webhookSubscriptions?.edges ?? [];
    const present = new Set(
      edges
        .filter((e: any) => e?.node?.endpoint?.callbackUrl === callbackUrl)
        .map((e: any) => e.node.topic),
    );

    // 2) cria os que faltam
    for (const topic of TOPICS) {
      if (present.has(topic)) { report.existing.push(topic); continue; }
      const r = await shopifyGraphql(adminToken, CREATE_MUTATION, {
        topic,
        webhookSubscription: { callbackUrl, format: "JSON" },
      });
      const userErrors = r.json?.data?.webhookSubscriptionCreate?.userErrors ?? [];
      if (r.json?.errors) { report.errors.push({ topic, errors: r.json.errors }); }
      else if (userErrors.length > 0) { report.errors.push({ topic, userErrors }); }
      else { report.created.push(topic); }
    }

    const status = report.errors.length > 0 ? 207 : 200;
    return new Response(JSON.stringify(report), { status, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
