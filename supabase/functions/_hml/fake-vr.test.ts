/**
 * Testes do dublê `fake-vr.ts` — 100% offline (sem `fetch` real, sem VR de
 * verdade). Cobre o round-trip de criptografia com `encryptCardData`
 * (back-end, os dois paddings), a tokenização (`POST /cartoes` → pagamento com
 * token → `DELETE /cartoes/{id}`), os três outcomes (`approve`/`decline`/`timeout`),
 * consulta por `id_transacao_van` e estorno.
 */
import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { createFakeVr, type FakeVr } from "./fake-vr.ts";
import { encryptCardData, type VrCardInput } from "../_shared/vr-client.ts";

const CAPTURE_BASE = "https://api-devportal.vr.com.br/captura/v2";

const SAMPLE_CARD: VrCardInput = {
  nome: "QA VR TESTE",
  numero_cartao: "4111111111111111",
  data_expiracao: "2812",
  cvv: "123",
  documento: "52998224725",
};

async function getPublicKey(fake: FakeVr): Promise<{ key_id: string; public_key: string }> {
  const res = await fake.handle(`${CAPTURE_BASE}/chaves/chave-publica`, { method: "GET" });
  assert(res, "esperava a VR falsa responder /chaves/chave-publica");
  assertEquals(res.status, 200);
  return await res.json();
}

function paymentBody(params: { idTransacaoVan: string; keyId: string; cardEncrypted: string; valor?: number }): string {
  return JSON.stringify({
    valor: params.valor ?? 1000,
    id_filiacao: "148822",
    id_transacao_van: params.idTransacaoVan,
    quantidade_parcelas: 1,
    key_id: params.keyId,
    cartao_dados_criptografados: params.cardEncrypted,
  });
}

async function postPayment(fake: FakeVr, body: string, signal?: AbortSignal): Promise<Response> {
  const res = fake.handle(`${CAPTURE_BASE}/transacoes/pagamentos`, { method: "POST", body, signal });
  assert(res, "esperava a VR falsa responder /transacoes/pagamentos");
  return await res;
}

// ---------------------------------------------------------------------------
// URL fora da VR -> null
// ---------------------------------------------------------------------------

Deno.test("handle: URL que nao e da VR retorna null (nao intercepta)", () => {
  const fake = createFakeVr();
  assertEquals(fake.handle("https://jnutg9-u2.myshopify.com/api/2025-07/graphql.json"), null);
});

// ---------------------------------------------------------------------------
// Round-trip com encryptCardData (back-end) — os dois paddings
// ---------------------------------------------------------------------------

Deno.test("round-trip OAEP-SHA256 via encryptCardData aprova e registra o padding", async () => {
  const fake = createFakeVr();
  const { key_id, public_key } = await getPublicKey(fake);
  const cardEncrypted = await encryptCardData(public_key, SAMPLE_CARD, "oaep-sha256");
  const res = await postPayment(fake, paymentBody({ idTransacaoVan: "van-oaep", keyId: key_id, cardEncrypted }));
  assertEquals(res.status, 201);
  const json = await res.json();
  assertEquals(json.codigo_retorno, "00");
  assertEquals(fake.state.payments.length, 1);
  assertEquals(fake.state.payments[0].padding, "oaep-sha256");
  assertEquals(fake.state.payments[0].status, "CONFIRMADA");
});

Deno.test("round-trip PKCS#1 v1.5 via encryptCardData aprova e registra o padding", async () => {
  const fake = createFakeVr();
  const { key_id, public_key } = await getPublicKey(fake);
  const cardEncrypted = await encryptCardData(public_key, SAMPLE_CARD, "pkcs1");
  const res = await postPayment(fake, paymentBody({ idTransacaoVan: "van-pkcs1", keyId: key_id, cardEncrypted }));
  assertEquals(res.status, 201);
  const json = await res.json();
  assertEquals(json.codigo_retorno, "00");
  assertEquals(fake.state.payments[0].padding, "pkcs1");
});

// ---------------------------------------------------------------------------
// Cartão inválido -> 400 {codigo: "63"}, nunca loga o conteúdo (checado pela
// ausência de assert sobre stdout — o teste só verifica o shape da resposta).
// ---------------------------------------------------------------------------

Deno.test("cartao com JSON invalido apos decifrar retorna 400 codigo 63", async () => {
  const fake = createFakeVr();
  const { key_id } = await getPublicKey(fake);
  const res = await postPayment(fake, paymentBody({ idTransacaoVan: "van-bad", keyId: key_id, cardEncrypted: "bm9uc2Vuc2U=" }));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.codigo, "63");
  assertEquals(fake.state.payments.length, 0);
});

// ---------------------------------------------------------------------------
// Outcome: decline
// ---------------------------------------------------------------------------

Deno.test("nextOutcome decline:16 recusa e e consumido (proxima chamada volta a approve)", async () => {
  const fake = createFakeVr();
  const { key_id, public_key } = await getPublicKey(fake);
  const cardEncrypted = await encryptCardData(public_key, SAMPLE_CARD, "oaep-sha256");

  fake.state.nextOutcome = "decline:16";
  const declined = await postPayment(fake, paymentBody({ idTransacaoVan: "van-declined", keyId: key_id, cardEncrypted }));
  assertEquals(declined.status, 201);
  const declinedJson = await declined.json();
  assertEquals(declinedJson.codigo_retorno, "16");
  assertEquals(fake.state.payments[0].status, "NEGADA");

  // consumido: a proxima chamada, sem setar de novo, aprova.
  const approved = await postPayment(fake, paymentBody({ idTransacaoVan: "van-approved-after", keyId: key_id, cardEncrypted }));
  const approvedJson = await approved.json();
  assertEquals(approvedJson.codigo_retorno, "00");
});

// ---------------------------------------------------------------------------
// Outcome: timeout com abort
// ---------------------------------------------------------------------------

Deno.test("nextOutcome timeout registra CONFIRMADA na hora e rejeita com AbortError se o signal abortar", async () => {
  const fake = createFakeVr();
  const { key_id, public_key } = await getPublicKey(fake);
  const cardEncrypted = await encryptCardData(public_key, SAMPLE_CARD, "oaep-sha256");

  fake.state.nextOutcome = "timeout";
  const controller = new AbortController();
  const pending = fake.handle(`${CAPTURE_BASE}/transacoes/pagamentos`, {
    method: "POST",
    body: paymentBody({ idTransacaoVan: "van-timeout", keyId: key_id, cardEncrypted }),
    signal: controller.signal,
  });
  assert(pending);

  // A transacao ja deve estar CONFIRMADA no estado, mesmo antes da resposta HTTP voltar.
  assertEquals(fake.state.payments.length, 1);
  assertEquals(fake.state.payments[0].status, "CONFIRMADA");

  setTimeout(() => controller.abort(), 10);
  await assertRejects(() => pending, DOMException);
});

// ---------------------------------------------------------------------------
// GET por id_transacao_van
// ---------------------------------------------------------------------------

Deno.test("GET /transacoes/pagamentos/{van} encontra por id_transacao_van", async () => {
  const fake = createFakeVr();
  const { key_id, public_key } = await getPublicKey(fake);
  const cardEncrypted = await encryptCardData(public_key, SAMPLE_CARD, "oaep-sha256");
  await postPayment(fake, paymentBody({ idTransacaoVan: "van-consulta", keyId: key_id, cardEncrypted }));

  const res = await fake.handle(`${CAPTURE_BASE}/transacoes/pagamentos/van-consulta`, { method: "GET" });
  assert(res);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.status, "CONFIRMADA");
  assertEquals(json.id_transacao_van, "van-consulta");
});

Deno.test("GET /transacoes/pagamentos/{id-inexistente} retorna 404", async () => {
  const fake = createFakeVr();
  const res = await fake.handle(`${CAPTURE_BASE}/transacoes/pagamentos/nao-existe`, { method: "GET" });
  assert(res);
  assertEquals(res.status, 404);
});

// ---------------------------------------------------------------------------
// Estorno
// ---------------------------------------------------------------------------

Deno.test("POST /transacoes/pagamentos/{id}/estornos cancela e registra em state.refunds", async () => {
  const fake = createFakeVr();
  const { key_id, public_key } = await getPublicKey(fake);
  const cardEncrypted = await encryptCardData(public_key, SAMPLE_CARD, "oaep-sha256");
  const created = await postPayment(fake, paymentBody({ idTransacaoVan: "van-estorno", keyId: key_id, cardEncrypted, valor: 5000 }));
  const createdJson = await created.json();
  const idTransacao = createdJson.id_transacao as string;

  const res = await fake.handle(`${CAPTURE_BASE}/transacoes/pagamentos/${idTransacao}/estornos`, {
    method: "POST",
    body: JSON.stringify({ valor: 5000, id_filiacao: "148822" }),
  });
  assert(res);
  assertEquals(res.status, 201);
  const json = await res.json();
  assertEquals(json.codigo_retorno, "00");
  assertEquals(fake.state.refunds.length, 1);
  assertEquals(fake.state.refunds[0].id_transacao, idTransacao);

  const consulta = await fake.handle(`${CAPTURE_BASE}/transacoes/pagamentos/${idTransacao}`, { method: "GET" });
  assert(consulta);
  const consultaJson = await consulta.json();
  assertEquals(consultaJson.status, "CANCELADA");
});

Deno.test("POST estorno de transacao inexistente retorna 404", async () => {
  const fake = createFakeVr();
  const res = await fake.handle(`${CAPTURE_BASE}/transacoes/pagamentos/nao-existe/estornos`, {
    method: "POST",
    body: JSON.stringify({ valor: 100, id_filiacao: "148822" }),
  });
  assert(res);
  assertEquals(res.status, 404);
});

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

Deno.test("OAuth grant-code e access-token respondem shapes esperados", async () => {
  const fake = createFakeVr();
  const grant = await fake.handle("https://api.vr.com.br/oauth/grant-code", { method: "POST", body: "{}" });
  assert(grant);
  const grantJson = await grant.json();
  assertEquals(typeof grantJson.redirect_uri, "string");

  const token = await fake.handle("https://api.vr.com.br/oauth/access-token", { method: "POST", body: "{}" });
  assert(token);
  const tokenJson = await token.json();
  assertEquals(typeof tokenJson.access_token, "string");
  assertEquals(typeof tokenJson.refresh_token, "string");
  assertEquals(tokenJson.expires_in, 3600);
});

// ---------------------------------------------------------------------------
// Tokenização (checkout atual): POST /cartoes -> pagamento com token -> DELETE /cartoes/{id}
// ---------------------------------------------------------------------------

Deno.test("tokeniza, paga com cartao_token_id e apaga o token (token apagado nao paga mais)", async () => {
  const fake = createFakeVr();
  const created = fake.handle(`${CAPTURE_BASE}/cartoes`, {
    method: "POST",
    body: JSON.stringify({ numero_cartao: "4111111111111111", nome_impressao: "QA VR TESTE", cvv: "123", mes_validade: 8, ano_validade: 2030 }),
  });
  assert(created);
  const createdRes = await created;
  assertEquals(createdRes.status, 201);
  const { cartao_token_id } = await createdRes.json();

  const pay = async () =>
    await postPayment(fake, JSON.stringify({ valor: 1000, id_filiacao: "148822", id_transacao_van: "van-token", quantidade_parcelas: 1, cartao_token_id }));
  const paid = await pay();
  assertEquals(paid.status, 201);
  assertEquals((await paid.json()).codigo_retorno, "00");
  assertEquals(fake.state.payments[0].padding, "token");

  const del = fake.handle(`${CAPTURE_BASE}/cartoes/${cartao_token_id}`, { method: "DELETE" });
  assert(del);
  assertEquals((await del).status, 204);
  assertEquals(fake.state.tokens.length, 0);
  assertEquals(fake.state.deletedTokens, [cartao_token_id]);

  assertEquals((await pay()).status, 400);
});

Deno.test("POST /cartoes com mes_validade fora de 1-12 retorna 400", async () => {
  const fake = createFakeVr();
  const res = fake.handle(`${CAPTURE_BASE}/cartoes`, {
    method: "POST",
    body: JSON.stringify({ numero_cartao: "4111111111111111", nome_impressao: "QA", cvv: "123", mes_validade: 13, ano_validade: 2030 }),
  });
  assert(res);
  assertEquals((await res).status, 400);
  assertEquals(fake.state.tokens.length, 0);
});
