/**
 * Sonda do HMAC do shopify-webhook-receiver DEPLOYADO (achado 2026-09-25: 19 webhooks reais
 * recusados com "Invalid HMAC signature"; o pedido real #1012 não entrou em `orders`).
 *
 * Manda ao receiver de produção um POST com topic desconhecido (`probe/hmac` — não bate em
 * nenhuma rota, só grava uma linha em `webhook_events` e responde 200) assinado com o segredo
 * que você passar. 200 ⇒ o receiver usa ESSE segredo; 401 ⇒ usa outro.
 *
 *   npx -y deno run --allow-net --allow-env --allow-read --env-file=.env.vr-e2e \
 *     supabase/functions/_hml/hmac-probe.ts <segredo-candidato>
 *
 * Passe o Client secret do app Shopify (Dev Dashboard > app > Settings > Client credentials).
 * O segredo nunca é impresso.
 */
const secret = Deno.args[0];
if (!secret) { console.error("uso: hmac-probe.ts <segredo-candidato>"); Deno.exit(2); }
const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-webhook-receiver`;
const body = JSON.stringify({ id: `probe-${Date.now()}`, note: "hmac probe (sessao 2026-09-25) — ignorar" });
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))));
const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-shopify-hmac-sha256": sig, "x-shopify-topic": "probe/hmac", "x-shopify-shop-domain": Deno.env.get("SHOPIFY_STORE_DOMAIN") ?? "" }, body });
console.log(`receiver respondeu HTTP ${res.status} -> ${res.status === 401 ? "receiver usa OUTRO segredo (assinatura recusada)" : "assinatura ACEITA: este é o segredo que o receiver usa"}`);
