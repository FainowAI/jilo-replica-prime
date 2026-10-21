import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import { Buffer } from "node:buffer";
import { generateKeyPairSync } from "node:crypto";
import { __resetVrClientCaches } from "../_shared/vr-client.ts";
import { normalizeTestCardExpiry, runHomologacao, runPreflight } from "./vr-homologacao.ts";

Deno.test("validade de teste: converte MM/AA da VR para AAMM e preserva AAMM", () => {
  assertEquals(normalizeTestCardExpiry("11/39"), "3911");
  assertEquals(normalizeTestCardExpiry("3911"), "3911");
  assertThrows(() => normalizeTestCardExpiry("13/39"), Error, "mês válido");
  assertThrows(() => normalizeTestCardExpiry("11/2039"), Error, "MM/AA ou AAMM");
});

// ponytail: valores sentinela em vez de PAN/CVV/nome/documento "realistas" — evita falsos
// positivos/negativos na checagem de vazamento (dígitos curtos colidem com ids/valores).
const SENTINEL = {
  numero: "PAN_SENTINELA_0001",
  nome: "NOME_SENT_0001",
  cvv: "CVV_SENT_0001",
  documento: "DOC_SENT_0001",
  validadeAAMM: "2812", // AAMM real — o runner faz parsing (mes=12, ano=2028)
};

const ENV_VARS = [
  "VR_ENV",
  "VR_CLIENT_ID",
  "VR_CLIENT_SECRET",
  "VR_ID_FILIACAO",
  "VR_TEST_CARD_NUMERO",
  "VR_TEST_CARD_NOME",
  "VR_TEST_CARD_VALIDADE",
  "VR_TEST_CARD_CVV",
  "VR_TEST_CARD_DOCUMENTO",
  "VR_TEST_VALOR_CENTS",
];

function setEnv(): void {
  Deno.env.set("VR_ENV", "hml");
  Deno.env.set("VR_CLIENT_ID", "hml-client-id-sentinela");
  Deno.env.set("VR_CLIENT_SECRET", "hml-client-secret-sentinela");
  Deno.env.set("VR_ID_FILIACAO", "999888");
  Deno.env.set("VR_TEST_CARD_NUMERO", SENTINEL.numero);
  Deno.env.set("VR_TEST_CARD_NOME", SENTINEL.nome);
  Deno.env.set("VR_TEST_CARD_VALIDADE", SENTINEL.validadeAAMM);
  Deno.env.set("VR_TEST_CARD_CVV", SENTINEL.cvv);
  Deno.env.set("VR_TEST_CARD_DOCUMENTO", SENTINEL.documento);
  Deno.env.set("VR_TEST_VALOR_CENTS", "1000");
}

/**
 * Impede que sentinelas de um teste contaminem os outros casos no mesmo processo.
 */
function cleanEnv(): void {
  for (const name of ENV_VARS) Deno.env.delete(name);
}

type FetchHandler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function stubFetch(handler: FetchHandler) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function oauthHandler(): FetchHandler {
  return (url) => {
    if (url.includes("/oauth/grant-code")) {
      return new Response(JSON.stringify({ redirect_uri: "http://localhost/?code=abc123" }), { status: 200 });
    }
    if (url.includes("/oauth/access-token")) {
      return new Response(
        JSON.stringify({ access_token: "AT_SENTINELA_1", refresh_token: "RT_SENTINELA_1", expires_in: 3600 }),
        { status: 200 },
      );
    }
    throw new Error(`stub fetch: URL inesperada ${url}`);
  };
}

Deno.test("runPreflight: GET da chave em 403 falha sem chamar endpoints financeiros", async () => {
  setEnv();
  __resetVrClientCaches();
  const oauth = oauthHandler();
  const called: string[] = [];
  const { restore } = stubFetch((url, init) => {
    called.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    if (url.includes("/oauth/")) return oauth(url, init);
    if (url.includes("/chaves/chave-publica")) return new Response("{}", { status: 403 });
    throw new Error(`Endpoint inesperado: ${url}`);
  });
  try {
    const result = await runPreflight();
    assertEquals(result, { ok: false, message: "Falhou: vr_http_403 status=403" });
    assertEquals(called.some((path) => path.includes("/transacoes/") || path.includes("/cartoes/")), false);
  } finally {
    restore();
    cleanEnv();
  }
});

Deno.test("runPreflight: token e chave autorizados passam sem cartao", async () => {
  setEnv();
  __resetVrClientCaches();
  const oauth = oauthHandler();
  const { restore } = stubFetch((url, init) => {
    if (url.includes("/oauth/")) return oauth(url, init);
    if (url.includes("/chaves/chave-publica")) {
      return new Response(JSON.stringify({ key_id: "key-hml-sentinel", public_key: "PUBLIC_KEY_SENTINEL" }), { status: 200 });
    }
    throw new Error(`Endpoint inesperado: ${url}`);
  });
  try {
    const result = await runPreflight();
    assertEquals(result, { ok: true, message: "OK token + chave pública completa" });
  } finally {
    restore();
    cleanEnv();
  }
});

let seq = 0;
function nextId(prefix: string): string {
  seq++;
  return `${prefix}${seq}`;
}

/** Handler completo: OAuth + chave pública + todos os endpoints da API Captura, sempre com sucesso. */
function fullSuccessHandler(publicKeyPem: string): FetchHandler {
  const oauth = oauthHandler();
  const transactions = new Map<string, { id: string; valor: number; status: string }>();
  const reservations = new Map<string, { id: string; valor: number; status: string }>();
  return (url, init) => {
    if (url.includes("/oauth/")) return oauth(url, init);
    if (url.includes("/chaves/chave-publica")) {
      return new Response(JSON.stringify({ key_id: "key-hml-1", public_key: publicKeyPem }), { status: 200 });
    }
    if (url.endsWith("/transacoes/pagamentos/reservas") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const item = { id: nextId("res"), valor: body.valor, status: "PENDENTE" };
      reservations.set(item.id, item);
      reservations.set(body.id_transacao_van, item);
      return new Response(JSON.stringify({ id_transacao: item.id, valor: item.valor, status: item.status, codigo_retorno: "00" }), { status: 201 });
    }
    if (url.endsWith("/transacoes/pagamentos") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const item = { id: nextId("tx"), valor: body.valor, status: "CONFIRMADA" };
      transactions.set(item.id, item);
      transactions.set(body.id_transacao_van, item);
      return new Response(JSON.stringify({ id_transacao: item.id, valor: item.valor, codigo_retorno: "00", codigo_autorizacao: "AUTH1", mensagem: "ECO_SENSIVEL_SENTINELA" }), { status: 201 });
    }
    const refundId = url.match(/\/transacoes\/pagamentos\/([^/]+)\/estornos$/)?.[1];
    if (refundId && init?.method === "POST") {
      const item = transactions.get(refundId);
      if (!item) throw new Error("stub: transação do estorno ausente");
      const body = JSON.parse(String(init.body));
      if (body.valor === item.valor) item.status = "CANCELADA";
      return new Response(JSON.stringify({ id_transacao: item.id, valor: body.valor, codigo_retorno: "00" }), { status: 201 });
    }
    const reserveSettleId = url.match(/\/transacoes\/pagamentos\/([^/]+)\/reservas$/)?.[1];
    if (reserveSettleId && init?.method === "PATCH") {
      const item = reservations.get(reserveSettleId);
      if (!item) throw new Error("stub: reserva ausente");
      const body = JSON.parse(String(init.body));
      item.status = body.acao === "cancelar" ? "CANCELADA" : "CONFIRMADA";
      return new Response(JSON.stringify({ id_transacao: item.id, valor: item.valor, codigo_retorno: "00" }), { status: 200 });
    }
    const reserveGetId = url.match(/\/transacoes\/pagamentos\/reservas\/([^/]+)$/)?.[1];
    if (reserveGetId && init?.method !== "POST") {
      const item = reservations.get(reserveGetId);
      if (!item) throw new Error("stub: reserva consultada ausente");
      return new Response(JSON.stringify({ id_transacao: item.id, valor: item.valor, status: item.status, codigo_retorno: "00" }), { status: 200 });
    }
    const paymentGetId = url.match(/\/transacoes\/pagamentos\/([^/]+)$/)?.[1];
    if (paymentGetId && init?.method !== "POST") {
      const item = transactions.get(paymentGetId) ?? reservations.get(paymentGetId);
      if (!item) throw new Error("stub: transação consultada ausente");
      return new Response(JSON.stringify({ id_transacao: item.id, valor: item.valor, status: item.status }), { status: 200 });
    }
    if (url.endsWith("/cartoes") && init?.method === "POST") {
      return new Response(JSON.stringify({ cartao_token_id: "cartao-token-sentinela-0001", mensagens: [] }), { status: 201 });
    }
    if (url.includes("/cartoes/")) {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(
        JSON.stringify({ cartao: { cartao_token_id: "cartao-token-sentinela-0001", ultimos4_digitos: "0001", status_cartao: "ATIVO" }, mensagens: [] }),
        { status: 200 },
      );
    }
    throw new Error("stub fetch: URL inesperada " + url);
  };
}
function generateTestKeyPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function serializedLeaksSecrets(json: string, extra: string[] = []): boolean {
  const forbidden = [SENTINEL.numero, SENTINEL.cvv, SENTINEL.documento, SENTINEL.nome, "AT_SENTINELA_1", ...extra];
  return forbidden.some((s) => json.includes(s));
}

Deno.test("runHomologacao: 6 cenários ok, evidências sem PAN/CVV/documento/nome/access_token", async () => {
  setEnv();
  __resetVrClientCaches();
  seq = 0;
  const { publicKey } = generateTestKeyPair();
  const { restore } = stubFetch(fullSuccessHandler(publicKey));
  const tmpDir = await Deno.makeTempDir();

  try {
    const evidencias = await runHomologacao({ out: tmpDir, testOnlyRsaPadding: "oaep-sha256" });
    const cenarios = new Set(evidencias.map((e) => e.cenario));
    assertEquals(cenarios.size, 6);
    assert([...cenarios].includes("confirmacao"));
    assert([...cenarios].includes("cancelamento_estorno_total"));
    assert([...cenarios].includes("reserva_efetivacao"));
    assert([...cenarios].includes("reserva_cancelamento"));
    assert([...cenarios].includes("reembolso_parcial"));
    assert([...cenarios].includes("tokenizacao"));
    for (const cenario of cenarios) {
      const passos = evidencias.filter((e) => e.cenario === cenario);
      assert(passos.every((p) => p.ok), `cenario ${cenario} deveria ter todos os passos ok`);
    }

    const serialized = JSON.stringify(evidencias);
    assert(!serializedLeaksSecrets(serialized, ["ECO_SENSIVEL_SENTINELA"]), "evidências (retorno) vazaram dado sensível");

    const files = [...Deno.readDirSync(tmpDir)];
    assertEquals(files.length, 2);
    for (const f of files) {
      const content = await Deno.readTextFile(`${tmpDir}/${f.name}`);
      assert(!serializedLeaksSecrets(content, ["ECO_SENSIVEL_SENTINELA"]), `arquivo ${f.name} vazou dado sensível`);
    }
  } finally {
    restore();
    cleanEnv();
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("runHomologacao: bloqueia cenários HML sem contrato de tokenização ou RSA antes de qualquer fetch", async () => {
  setEnv();
  __resetVrClientCaches();
  let fetchCalled = false;
  const { restore } = stubFetch(() => {
    fetchCalled = true;
    throw new Error("não deveria chamar fetch sem contrato RSA");
  });
  try {
    await assertRejects(() => runHomologacao(), Error, "confirmar tokenização inicial e escopo");
    assertEquals(fetchCalled, false);
  } finally {
    restore();
    cleanEnv();
  }
});

Deno.test("runHomologacao: pagamento não comprovado interrompe a suíte e grava evidência", async () => {
  setEnv();
  __resetVrClientCaches();
  seq = 0;
  const { publicKey } = generateTestKeyPair();
  const success = fullSuccessHandler(publicKey);
  let paymentCalls = 0;
  const { restore } = stubFetch((url, init) => {
    if (url.endsWith("/transacoes/pagamentos") && init?.method === "POST") {
      paymentCalls++;
      if (paymentCalls === 1) {
        return new Response(JSON.stringify({ id_transacao: "tx-recusa", valor: 1000, codigo_retorno: "63" }), { status: 201 });
      }
    }
    return success(url, init);
  });
  const tmpDir = await Deno.makeTempDir();
  try {
    await assertRejects(() => runHomologacao({ out: tmpDir, testOnlyRsaPadding: "oaep-sha256" }), Error, "interromper e reconciliar");
    const file = [...Deno.readDirSync(tmpDir)].find((item) => item.name.endsWith(".json"));
    assert(file);
    const evidencias = JSON.parse(await Deno.readTextFile(`${tmpDir}/${file.name}`)).evidencias;
    const confirmacao = evidencias.find((e: { cenario: string; passo: string }) => e.cenario === "confirmacao" && e.passo === "createPayment");
    assertEquals(confirmacao?.ok, false);
    assertEquals(paymentCalls, 1, "não inicia outra operação financeira após resultado incerto");
  } finally {
    restore();
    cleanEnv();
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("runHomologacao: eco do cartão em identificador da VR não entra na evidência", async () => {
  setEnv();
  __resetVrClientCaches();
  seq = 0;
  const { publicKey } = generateTestKeyPair();
  const success = fullSuccessHandler(publicKey);
  let firstPayment = true;
  const { restore } = stubFetch((url, init) => {
    if (firstPayment && url.endsWith("/transacoes/pagamentos") && init?.method === "POST") {
      firstPayment = false;
      return new Response(JSON.stringify({ id_transacao: SENTINEL.numero, valor: 1000, codigo_retorno: "00" }), { status: 201 });
    }
    return success(url, init);
  });
  const tmpDir = await Deno.makeTempDir();
  try {
    await assertRejects(() => runHomologacao({ out: tmpDir, testOnlyRsaPadding: "oaep-sha256" }), Error, "interromper e reconciliar");
    const file = [...Deno.readDirSync(tmpDir)].find((item) => item.name.endsWith(".json"));
    assert(file);
    const evidencias = JSON.parse(await Deno.readTextFile(`${tmpDir}/${file.name}`)).evidencias;
    const confirmacao = evidencias.find((e: { cenario: string; passo: string }) => e.cenario === "confirmacao" && e.passo === "createPayment");
    assertEquals(confirmacao?.ok, false);
    for (const file of Deno.readDirSync(tmpDir)) {
      assert(!serializedLeaksSecrets(await Deno.readTextFile(`${tmpDir}/${file.name}`)));
    }
  } finally {
    restore();
    cleanEnv();
    await Deno.remove(tmpDir, { recursive: true });
  }
});
Deno.test("runHomologacao: consulta pendente não aprova confirmação", async () => {
  setEnv();
  __resetVrClientCaches();
  seq = 0;
  const { publicKey } = generateTestKeyPair();
  const success = fullSuccessHandler(publicKey);
  let firstConsult = true;
  const { restore } = stubFetch((url, init) => {
    if (firstConsult && (!init?.method || init.method === "GET") && /\/transacoes\/pagamentos\/[^/]+$/.test(url)) {
      firstConsult = false;
      return new Response(JSON.stringify({ id_transacao: "tx-pendente", status: "PENDENTE", valor: 1000 }), { status: 200 });
    }
    return success(url, init);
  });
  const tmpDir = await Deno.makeTempDir();
  try {
    await assertRejects(() => runHomologacao({ out: tmpDir, testOnlyRsaPadding: "oaep-sha256" }), Error, "interromper e reconciliar");
    const file = [...Deno.readDirSync(tmpDir)].find((item) => item.name.endsWith(".json"));
    assert(file);
    const evidencias = JSON.parse(await Deno.readTextFile(`${tmpDir}/${file.name}`)).evidencias;
    const consulta = evidencias.find((e: { cenario: string; passo: string }) => e.cenario === "confirmacao" && e.passo === "getTransaction");
    assertEquals(consulta?.ok, false);
    assertEquals(evidencias.some((e: { cenario: string }) => e.cenario !== "confirmacao"), false);
  } finally {
    restore();
    cleanEnv();
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("runHomologacao: pagamento tokenizado incerto não exclui token", async () => {
  setEnv();
  __resetVrClientCaches();
  seq = 0;
  const { publicKey } = generateTestKeyPair();
  const success = fullSuccessHandler(publicKey);
  let tokenPaymentCalls = 0;
  let tokenDeletes = 0;
  const { restore } = stubFetch((url, init) => {
    if (url.includes("/cartoes/") && init?.method === "DELETE") tokenDeletes++;
    if (url.endsWith("/transacoes/pagamentos") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (body.cartao_token_id) {
        tokenPaymentCalls++;
        return new Response("{}", { status: 504 });
      }
    }
    return success(url, init);
  });
  const tmpDir = await Deno.makeTempDir();
  try {
    await assertRejects(() => runHomologacao({ out: tmpDir, testOnlyRsaPadding: "oaep-sha256" }), Error, "interromper e reconciliar");
    assertEquals(tokenPaymentCalls, 1);
    assertEquals(tokenDeletes, 0);
    const file = [...Deno.readDirSync(tmpDir)].find((item) => item.name.endsWith(".json"));
    assert(file);
    const evidencias = JSON.parse(await Deno.readTextFile(`${tmpDir}/${file.name}`)).evidencias;
    assertEquals(evidencias.at(-1)?.passo, "createPayment(cartaoTokenId)");
    assertEquals(evidencias.at(-1)?.ok, false);
  } finally {
    restore();
    cleanEnv();
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("runHomologacao: recusa VR_ENV=prod sem chamar a rede", async () => {
  Deno.env.set("VR_ENV", "prod");
  Deno.env.set("VR_CLIENT_ID", "hml-client-id-sentinela");
  Deno.env.set("VR_CLIENT_SECRET", "hml-client-secret-sentinela");
  Deno.env.set("VR_ID_FILIACAO", "999888");
  __resetVrClientCaches();

  let fetchCalled = false;
  const { restore } = stubFetch(() => {
    fetchCalled = true;
    throw new Error("não deveria chamar fetch com VR_ENV=prod");
  });

  try {
    await assertRejects(() => runHomologacao(), Error, "hml");
    assertEquals(fetchCalled, false);
  } finally {
    restore();
    cleanEnv(); // nunca deixar VR_ENV=prod nem VR_CLIENT_ID vazando pro resto do processo
  }
});

Deno.test("runHomologacao: recusa VR_ENV=mock sem chamar a rede", async () => {
  Deno.env.set("VR_ENV", "mock");
  __resetVrClientCaches();

  let fetchCalled = false;
  const { restore } = stubFetch(() => {
    fetchCalled = true;
    throw new Error("não deveria chamar fetch com VR_ENV=mock");
  });

  try {
    await assertRejects(() => runHomologacao(), Error, "hml");
    assertEquals(fetchCalled, false);
  } finally {
    restore();
    cleanEnv();
  }
});
