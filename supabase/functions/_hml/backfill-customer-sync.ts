/**
 * Backfill: vincula ao Shopify os `profiles` com `shopify_customer_id IS NULL`
 * (bug do `identifier` no customerCreate deixou 0/22 vinculados). NÃO deployado.
 *
 * Uso:
 *   npx -y deno run --allow-net --allow-env --allow-read \
 *     --env-file=.env.vr-e2e supabase/functions/_hml/backfill-customer-sync.ts [--dry-run]
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SHOPIFY_STORE_DOMAIN,
 * SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET (lidas por _shared/shopify-admin-auth.ts).
 *
 * `--dry-run`: só imprime a contagem (sem chamar a Shopify). Stdout sem PII:
 * apenas id do profile e action. Erro por usuário: loga e segue; erro de
 * auth Shopify (token/401/403): aborta.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getShopifyAdminToken } from "../_shared/shopify-admin-auth.ts";
import { upsertShopifyCustomer } from "../_shared/shopify-customer-upsert.ts";

const dryRun = Deno.args.includes("--dry-run");
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const domain = Deno.env.get("SHOPIFY_STORE_DOMAIN")!;
const version = Deno.env.get("SHOPIFY_API_VERSION") ?? "2025-10";

class AuthError extends Error {}

async function callAdmin(payload: { query: string; variables?: object }): Promise<Response> {
  let token: string;
  try {
    token = await getShopifyAdminToken();
  } catch {
    throw new AuthError("shopify token request failed");
  }
  const res = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify(payload),
  });
  if (res.status === 401 || res.status === 403) throw new AuthError(`shopify auth http ${res.status}`);
  return res;
}

function splitName(full: string | null | undefined) {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? null, lastName: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

const { data: profiles, error } = await supabase
  .from("profiles").select("id, full_name, phone").is("shopify_customer_id", null);
if (error) throw new Error(`profiles query failed: ${error.message}`);
console.log(`profiles sem shopify_customer_id: ${profiles.length}${dryRun ? " (dry-run)" : ""}`);

let linked = 0, created = 0, failed = 0;
for (const p of profiles) {
  try {
    const { data, error: uErr } = await supabase.auth.admin.getUserById(p.id);
    const email = data?.user?.email;
    if (uErr || !email) throw new Error("user/email not found");
    if (dryRun) { console.log(`${p.id} would-upsert`); continue; }

    const { firstName, lastName } = splitName(p.full_name || data.user?.user_metadata?.full_name);
    const r = await upsertShopifyCustomer(callAdmin, {
      email, firstName, lastName, phone: p.phone || null,
      tags: ["jilo-customer", "source:supabase"],
      note: `Sincronizado do Supabase em ${new Date().toISOString()}`,
    });
    const { error: wErr } = await supabase.from("profiles").update({ shopify_customer_id: r.customerId }).eq("id", p.id);
    if (wErr) throw new Error("profile update failed");
    r.action === "linked" ? linked++ : created++;
    console.log(`${p.id} ${r.action}`);
  } catch (e) {
    if (e instanceof AuthError) { console.error(`ABORT (auth): ${e.message}`); Deno.exit(1); }
    failed++;
    console.error(`${p.id} FAILED: ${(e as Error).message}`);
  }
}
if (!dryRun) console.log(`linked=${linked} created=${created} failed=${failed}`);
