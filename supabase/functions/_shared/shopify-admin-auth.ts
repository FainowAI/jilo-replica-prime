/**
 * Helper compartilhado pra obtenção e cache de Shopify Admin API access tokens.
 *
 * A Shopify migrou pro Dev Dashboard novo (Dec 2025) e deprecou a entrega direta
 * de shpat_ permanente. Agora, o shpat_ é gerado dinamicamente via OAuth 2.0
 * Client Credentials Grant:
 *
 *   POST https://{shop}.myshopify.com/admin/oauth/access_token
 *   Content-Type: application/x-www-form-urlencoded
 *   grant_type=client_credentials&client_id={id}&client_secret={secret}
 *
 * Token expira em 24h (86399s). Este helper:
 * - Lê o token cached da tabela `public.shopify_admin_tokens`
 * - Se ainda tem >1h de validade, retorna o cached
 * - Senão, faz refresh via OAuth e atualiza o cache (upsert)
 *
 * Uso nas Edge Functions:
 *   import { getShopifyAdminToken } from "../_shared/shopify-admin-auth.ts";
 *   const token = await getShopifyAdminToken();
 *   const res = await fetch(graphqlUrl, {
 *     headers: { "X-Shopify-Access-Token": token, ... }
 *   });
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHOPIFY_STORE_DOMAIN = Deno.env.get("SHOPIFY_STORE_DOMAIN")!;
const SHOPIFY_CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID")!;
const SHOPIFY_CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET")!;

// Refresh threshold: se token expira em menos de 1h, faz refresh proativo.
// Margem ampla pra evitar race entre check e uso do token.
const REFRESH_THRESHOLD_MS = 60 * 60 * 1000; // 1 hora

interface CachedToken {
  access_token: string;
  scope: string;
  expires_at: string; // ISO timestamp
}

interface TokenResponse {
  access_token: string;
  scope: string;
  expires_in: number;
}

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
}

/**
 * Lê o token cached do Supabase, retorna null se não existe ou se está próximo
 * de expirar (< REFRESH_THRESHOLD_MS).
 */
async function readCachedToken(): Promise<CachedToken | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("shopify_admin_tokens")
    .select("access_token, scope, expires_at")
    .eq("shop_domain", SHOPIFY_STORE_DOMAIN)
    .eq("client_id", SHOPIFY_CLIENT_ID)
    .maybeSingle();

  if (error) {
    console.error("[shopify-admin-auth] readCachedToken error:", error);
    return null;
  }

  if (!data) return null;

  const expiresAt = new Date(data.expires_at).getTime();
  const now = Date.now();
  const remainingMs = expiresAt - now;

  if (remainingMs < REFRESH_THRESHOLD_MS) {
    return null; // tá perto de expirar, força refresh
  }

  return data as CachedToken;
}

/**
 * Faz POST /admin/oauth/access_token com client_credentials e retorna o novo
 * shpat_. Lança erro se a chamada falhar.
 */
async function fetchNewToken(): Promise<TokenResponse> {
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: SHOPIFY_CLIENT_ID,
    client_secret: SHOPIFY_CLIENT_SECRET,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `[shopify-admin-auth] OAuth token request failed: HTTP ${res.status} ${errorText}`
    );
  }

  const data = await res.json();

  if (!data.access_token || typeof data.access_token !== "string") {
    throw new Error(
      `[shopify-admin-auth] OAuth response missing access_token: ${JSON.stringify(data)}`
    );
  }

  return {
    access_token: data.access_token,
    scope: data.scope ?? "",
    expires_in: data.expires_in ?? 86399,
  };
}

/**
 * Persiste o novo token no Supabase via upsert na constraint unique
 * (shop_domain, client_id). Idempotente: chamadas concorrentes de edges
 * diferentes não duplicam rows.
 */
async function writeCachedToken(token: TokenResponse): Promise<void> {
  const supabase = getSupabase();
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

  const { error } = await supabase
    .from("shopify_admin_tokens")
    .upsert(
      {
        shop_domain: SHOPIFY_STORE_DOMAIN,
        client_id: SHOPIFY_CLIENT_ID,
        access_token: token.access_token,
        scope: token.scope,
        expires_at: expiresAt,
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: "shop_domain,client_id" }
    );

  if (error) {
    console.error("[shopify-admin-auth] writeCachedToken error:", error);
    throw new Error(`Failed to cache Shopify admin token: ${error.message}`);
  }
}

/**
 * Retorna um access token Shopify Admin válido. Idempotente, async-safe.
 *
 * Race condition note: se 2 edges chamam getShopifyAdminToken() ao mesmo
 * tempo com cache expirado, ambas fazem fetchNewToken() e ambas fazem
 * upsert. A última a escrever "ganha" — não há problema porque o token
 * gerado mais recente é o que vai pra cache. Não tem risco de invalidação
 * cruzada porque a Shopify aceita múltiplos tokens vivos ao mesmo tempo
 * (cada chamada gera um novo, os anteriores continuam válidos até expirar).
 */
export async function getShopifyAdminToken(): Promise<string> {
  // 1. Tenta usar cache
  const cached = await readCachedToken();
  if (cached) return cached.access_token;

  // 2. Cache miss / expirado / próximo de expirar — gera novo
  console.log("[shopify-admin-auth] Refreshing Shopify Admin token via Client Credentials");
  const newToken = await fetchNewToken();
  await writeCachedToken(newToken);
  return newToken.access_token;
}

/**
 * Força refresh, ignorando cache. Use APENAS em cenários específicos:
 * - Resposta da Shopify retornou 401 (token foi revogado server-side)
 * - Debug manual
 *
 * Não use no caminho normal.
 */
export async function forceRefreshShopifyAdminToken(): Promise<string> {
  console.log("[shopify-admin-auth] Force-refreshing Shopify Admin token");
  const newToken = await fetchNewToken();
  await writeCachedToken(newToken);
  return newToken.access_token;
}
