/**
 * Teste ponta a ponta do pagamento VR contra a HOMOLOGAÇÃO REAL da VR (sem dinheiro real):
 * roda o handler de verdade (`handleVrCheckout` + `buildDefaultDeps()`) na máquina, com
 * Shopify e Supabase reais e a API Captura em `api-hmp`. Cria UM carrinho de 7 marmitas,
 * paga com o cartão de teste oficial (tokeniza → paga → apaga o token, no servidor),
 * confere o pedido na Shopify e limpa: estorno total na VR + cancelamento com restock.
 * Autorizado pelo dono em 2026-10-21 ("faz tudo").
 *
 * Uso (o segundo env-file sobrescreve VR_* do primeiro):
 *   npx -y deno run --allow-net --allow-env --allow-read \
 *     --env-file=.env.vr-e2e --env-file=.env.vr-hml \
 *     supabase/functions/_hml/vr-checkout-hml-live.ts [--keep]
 *
 * Nunca logar: PAN, CVV, CPF, nome, token do cartão, JWT ou chaves. Só passos, status e ids.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildDefaultDeps, handleVrCheckout } from "../vr-checkout/handler.ts";
import { refund } from "../_shared/vr-client.ts";
import { callShopifyAdmin } from "../_shared/shopify-admin-client.ts";
import { normalizeTestCardExpiry } from "./vr-homologacao.ts";

const QA_EMAIL = "qa-vr@jilomarmitas.com";
const QA_ADDRESS_ID_SJC = "7431f1f6-c9df-463f-8728-0bf6f80e02b9";
const STOREFRONT = "https://jnutg9-u2.myshopify.com/api/2025-07/graphql.json";
const VARIANT = "gid://shopify/ProductVariant/46458669629580";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} ausente`);
  return v;
}

async function storefront<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(STOREFRONT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": env("SHOPIFY_STOREFRONT_TOKEN") },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`storefront_${res.status}`);
  return json.data as T;
}

async function main() {
  // Guardas antes de qualquer efeito.
  if (env("VR_ENV") !== "hml") throw new Error("VR_ENV precisa ser hml");
  const card = {
    nome: env("VR_TEST_CARD_NOME"),
    numero_cartao: env("VR_TEST_CARD_NUMERO"),
    data_expiracao: normalizeTestCardExpiry(env("VR_TEST_CARD_VALIDADE")),
    cvv: env("VR_TEST_CARD_CVV"),
  };
  const cpf = env("VR_TEST_CARD_DOCUMENTO");
  const keep = Deno.args.includes("--keep");

  const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const anon = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"));

  const { data: link, error: linkErr } = await service.auth.admin.generateLink({ type: "magiclink", email: QA_EMAIL });
  if (linkErr || !link?.properties?.hashed_token) throw new Error("generateLink falhou");
  const { data: otp, error: otpErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  const jwt = otp?.session?.access_token;
  if (otpErr || !jwt) throw new Error("verifyOtp falhou");
  console.log("1. sessão do usuário QA ok");

  const created = await storefront<{ cartCreate: { cart: { id: string } | null } }>(
    `mutation($lines:[CartLineInput!]!){cartCreate(input:{lines:$lines}){cart{id}}}`,
    { lines: [{ merchandiseId: VARIANT, quantity: 7 }] },
  );
  const cartId = created.cartCreate.cart?.id;
  if (!cartId) throw new Error("cartCreate falhou");
  console.log("2. carrinho de 7 marmitas criado");

  const req = new Request("http://localhost/vr-checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, Origin: "http://localhost:5173", "Content-Type": "application/json" },
    body: JSON.stringify({ cartId, selectedAddressId: QA_ADDRESS_ID_SJC, deliveryMethod: "jilo_own", cpf, card }),
  });
  const res = await handleVrCheckout(req, buildDefaultDeps());
  const body = await res.json();
  console.log(`3. vr-checkout → HTTP ${res.status} ${body.orderName ?? body.code ?? ""}`);

  const { data: row } = await service
    .from("vr_transactions")
    .select("status, valor_cents, vr_id_transacao, vr_codigo_retorno, shopify_order_id, error")
    .eq("cart_id", cartId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log(`4. vr_transactions: status=${row?.status} retorno=${row?.vr_codigo_retorno} valor=${row?.valor_cents} erro=${row?.error ?? "-"}`);

  if (res.status === 200 && row?.shopify_order_id) {
    const { order } = await callShopifyAdmin<{ order: { name: string; tags: string[]; displayFinancialStatus: string } | null }>(
      `query($id:ID!){order(id:$id){name tags displayFinancialStatus}}`,
      { id: row.shopify_order_id },
    );
    console.log(`5. Shopify: ${order?.name} ${order?.displayFinancialStatus} tags=${order?.tags.join(",")}`);
  }

  if (keep) return console.log("--keep: sem limpeza");
  // Estorna sempre que houve transação na VR (inclusive status incerto) e cancela mesmo se o estorno falhar.
  if (row?.vr_id_transacao && !String(row.status).startsWith("refunded")) {
    try {
      await refund({ idTransacao: row.vr_id_transacao, valorCents: row.valor_cents });
      console.log("6. estorno total na VR HML ok");
    } catch (err) {
      console.log(`6. estorno falhou (${err instanceof Error ? err.message.slice(0, 40) : "?"}) — conferir manualmente`);
    }
  }
  if (row?.shopify_order_id) {
    const out = await callShopifyAdmin<{ orderCancel: { orderCancelUserErrors: { message: string }[] } }>(
      `mutation($id:ID!){orderCancel(orderId:$id,reason:OTHER,restock:true,notifyCustomer:false,staffNote:"Teste VR HML",refundMethod:{originalPaymentMethodsRefund:false}){orderCancelUserErrors{message}}}`,
      { id: row.shopify_order_id },
    );
    const errs = out.orderCancel.orderCancelUserErrors;
    console.log(errs.length ? `7. cancelamento falhou: ${errs.map((e) => e.message).join("; ")}` : "7. pedido cancelado com restock");
  }
}

if (import.meta.main) await main();
