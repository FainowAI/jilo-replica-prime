import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { Buffer } from "node:buffer";
import { constants as nodeConstants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { __resetVrClientCaches } from "../_shared/vr-client.ts";
import { runHomologacao } from "./vr-homologacao.ts";

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
 * ponytail: `Deno.test` de outros arquivos (ex.: o teste LIVE de vr-client.test.ts,
 * `ignore: !Deno.env.get("VR_CLIENT_ID")`) roda no mesmo processo — sem isso, um
 * VR_CLIENT_ID de teste vazando no ambiente destrava esse teste ao vivo sem querer.
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

let seq = 0;
function nextId(prefix: string): string {
  seq++;
  return `${prefix}${seq}`;
}

/** Handler completo: OAuth + chave pública + todos os endpoints da API Captura, sempre com sucesso. */
function fullSuccessHandler(publicKeyPem: string): FetchHandler {
  const oauth = oauthHandler();
  return (url, init) => {
    if (url.includes("/oauth/")) return oauth(url, init);
    if (url.includes("/chaves/chave-publica")) {
      return new Response(JSON.stringify({ key_id: "key-hml-1", public_key: publicKeyPem }), { status: 200 });
    }
    if (url.endsWith("/transacoes/pagamentos/reservas")) {
      return new Response(
        JSON.stringify({ id_transacao: nextId("res"), valor: 1000, status: "PENDENTE", codigo_retorno: "00" }),
        { status: 201 },
      );
    }
    if (url.endsWith("/transacoes/pagamentos")) {
      return new Response(
        JSON.stringify({ id_transacao: nextId("tx"), valor: 1000, codigo_retorno: "00", codigo_autorizacao: "AUTH1" }),
        { status: 201 },
      );
    }
    if (url.includes("/transacoes/pagamentos/") && url.endsWith("/estornos")) {
      return new Response(JSON.stringify({ id_transacao: "tx-estorno", valor: 400, codigo_retorno: "00" }), { status: 201 });
    }
    if (url.includes("/transacoes/pagamentos/reservas/")) {
      return new Response(
        JSON.stringify({ id_transacao: "res-1", valor: 1000, status: "PENDENTE", codigo_retorno: "00" }),
        { status: 200 },
      );
    }
    if (url.includes("/transacoes/pagamentos/") && url.endsWith("/reservas")) {
      return new Response(JSON.stringify({ id_transacao: "res-1", valor: 1000, codigo_retorno: "00" }), { status: 200 });
    }
    if (url.includes("/transacoes/pagamentos/")) {
      return new Response(JSON.stringify({ id_transacao: "tx-1", status: "CONFIRMADA", valor: 1000 }), { status: 200 });
    }
    if (url.endsWith("/cartoes")) {
      return new Response(JSON.stringify({ cartao_token_id: "cartao-token-sentinela-0001", mensagens: [] }), { status: 201 });
    }
    if (url.includes("/cartoes/")) {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(
        JSON.stringify({
          cartao: { cartao_token_id: "cartao-token-sentinela-0001", ultimos4_digitos: "0001", status_cartao: "ATIVO" },
          mensagens: [],
        }),
        { status: 200 },
      );
    }
    throw new Error(`stub fetch: URL inesperada ${url}`);
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
    const evidencias = await runHomologacao({ out: tmpDir });
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
    assert(!serializedLeaksSecrets(serialized), "evidências (retorno) vazaram dado sensível");

    const files = [...Deno.readDirSync(tmpDir)];
    assertEquals(files.length, 2);
    for (const f of files) {
      const content = await Deno.readTextFile(`${tmpDir}/${f.name}`);
      assert(!serializedLeaksSecrets(content), `arquivo ${f.name} vazou dado sensível`);
    }
  } finally {
    restore();
    cleanEnv();
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("runHomologacao: 400 no primeiro pagamento cifrado cai para pkcs1 e registra o padding", async () => {
  setEnv();
  __resetVrClientCaches();
  seq = 0;
  const { publicKey, privateKey } = generateTestKeyPair();
  const tmpDir = await Deno.makeTempDir();

  let paymentCalls = 0;
  const sentVans: string[] = [];
  const oauth = oauthHandler();
  const { restore } = stubFetch((url, init) => {
    if (url.includes("/oauth/")) return oauth(url, init);
    if (url.includes("/chaves/chave-publica")) {
      return new Response(JSON.stringify({ key_id: "key-hml-1", public_key: publicKey }), { status: 200 });
    }
    if (url.endsWith("/transacoes/pagamentos") && init?.method === "POST") {
      paymentCalls++;
      const body = JSON.parse(String(init?.body));
      // Só as 2 primeiras chamadas (cenário "confirmacao", que fixa o padding) mexem com
      // cartão cifrado; as demais (outros cenários reaproveitando o padding fixado, e a
      // tokenização, que usa cartao_token_id) não precisam ser verificadas aqui de novo.
      if (paymentCalls === 1) {
        sentVans.push(body.id_transacao_van);
        // Prova que a 1a tentativa realmente cifrou com OAEP.
        privateDecrypt(
          { key: privateKey, padding: nodeConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
          Buffer.from(body.cartao_dados_criptografados, "base64"),
        );
        return new Response(JSON.stringify({ mensagem: "Dados do cartão inválidos" }), { status: 400 });
      }
      if (paymentCalls === 2) {
        sentVans.push(body.id_transacao_van);
        // Prova que o retry realmente cifrou com PKCS#1 v1.5.
        const plain = privateDecrypt({ key: privateKey, padding: nodeConstants.RSA_PKCS1_PADDING }, Buffer.from(body.cartao_dados_criptografados, "base64"));
        assert(JSON.parse(plain.toString("utf8")).numero_cartao === SENTINEL.numero);
      }
      return new Response(JSON.stringify({ id_transacao: nextId("tx"), valor: 1000, codigo_retorno: "00" }), { status: 201 });
    }
    if (url.endsWith("/transacoes/pagamentos/reservas") && init?.method === "POST") {
      // Reservas reutilizam o padding já fixado (pkcs1) — só confere na 1a reserva
      // (cenário "reserva_efetivacao"); a 2a (reserva_cancelamento) não precisa reverificar.
      const body = JSON.parse(String(init?.body));
      const plain = privateDecrypt({ key: privateKey, padding: nodeConstants.RSA_PKCS1_PADDING }, Buffer.from(body.cartao_dados_criptografados, "base64"));
      assert(JSON.parse(plain.toString("utf8")).numero_cartao === SENTINEL.numero);
      return new Response(JSON.stringify({ id_transacao: nextId("res"), valor: 1000, status: "PENDENTE", codigo_retorno: "00" }), { status: 201 });
    }
    if (url.includes("/estornos")) {
      return new Response(JSON.stringify({ id_transacao: "tx-estorno", valor: 400, codigo_retorno: "00" }), { status: 201 });
    }
    if (url.includes("/transacoes/pagamentos/reservas/")) {
      return new Response(JSON.stringify({ id_transacao: "res-1", valor: 1000, status: "PENDENTE", codigo_retorno: "00" }), { status: 200 });
    }
    if (url.includes("/transacoes/pagamentos/") && url.endsWith("/reservas")) {
      return new Response(JSON.stringify({ id_transacao: "res-1", valor: 1000, codigo_retorno: "00" }), { status: 200 });
    }
    if (url.includes("/transacoes/pagamentos/")) {
      return new Response(JSON.stringify({ id_transacao: "tx-1", status: "CANCELADA", valor: 1000 }), { status: 200 });
    }
    if (url.endsWith("/cartoes")) {
      return new Response(JSON.stringify({ cartao_token_id: "cartao-token-sentinela-0001", mensagens: [] }), { status: 201 });
    }
    if (url.includes("/cartoes/")) {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(
        JSON.stringify({ cartao: { cartao_token_id: "cartao-token-sentinela-0001", ultimos4_digitos: "0001", status_cartao: "ATIVO" }, mensagens: [] }),
        { status: 200 },
      );
    }
    throw new Error(`stub fetch: URL inesperada ${url}`);
  });

  try {
    const evidencias = await runHomologacao({ out: tmpDir });
    assert(paymentCalls >= 2, "esperava ao menos a 1a tentativa (OAEP, 400) + retry (PKCS#1)");
    assert(sentVans[0] !== sentVans[1], "o retry deveria usar um novo id_transacao_van");
    const confirmacaoPayment = evidencias.find((e) => e.cenario === "confirmacao" && e.passo === "createPayment");
    assertEquals(confirmacaoPayment?.padding, "pkcs1");
    assertEquals(confirmacaoPayment?.id_transacao_van, sentVans[1]);

    const reservaPayment = evidencias.find((e) => e.cenario === "reserva_efetivacao" && e.passo === "createReservation");
    assertEquals(reservaPayment?.padding, "pkcs1", "reservas devem reutilizar o padding já fixado");
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
