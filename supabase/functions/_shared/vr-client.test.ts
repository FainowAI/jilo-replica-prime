import { assert, assertEquals, assertMatch, assertRejects } from "jsr:@std/assert";
import { Buffer } from "node:buffer";
import { constants as nodeConstants, createPublicKey, generateKeyPairSync, privateDecrypt } from "node:crypto";
import {
  __resetVrClientCaches,
  classifyReturnCode,
  createPayment,
  createReservation,
  deleteTokenizedCard,
  encryptCardData,
  forceRefreshVrAccessToken,
  getPublicKey,
  getReservation,
  getTokenizedCard,
  getTransaction,
  getVrAccessToken,
  invalidatePublicKeyCache,
  newIdTransacaoVan,
  refund,
  settleReservation,
  tokenizeCard,
  VrApiError,
  type VrCardInput,
} from "./vr-client.ts";

function setEnv(): void {
  Deno.env.set("VR_ENV", "mock");
  Deno.env.set("VR_CLIENT_ID", "test-client-id");
  Deno.env.set("VR_CLIENT_SECRET", "test-client-secret");
  Deno.env.set("VR_ID_FILIACAO", "123456");
}

type FetchHandler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

/** Troca globalThis.fetch por um stub; SEMPRE restaurar no finally do teste. */
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

/** Handler de OAuth padrão: aprova grant-code e access-token (authorization_code ou refresh_token). */
function oauthHandler(onTokenCall?: (body: Record<string, unknown>) => void): FetchHandler {
  let tokenSeq = 0;
  return (url, init) => {
    if (url.includes("/oauth/grant-code")) {
      return new Response(JSON.stringify({ redirect_uri: "http://localhost/?code=abc123" }), { status: 200 });
    }
    if (url.includes("/oauth/access-token")) {
      tokenSeq++;
      const body = JSON.parse(String(init?.body));
      onTokenCall?.(body);
      return new Response(
        JSON.stringify({ access_token: `AT${tokenSeq}`, refresh_token: `RT${tokenSeq}`, expires_in: 3600 }),
        { status: 200 },
      );
    }
    throw new Error(`stub fetch: URL inesperada ${url}`);
  };
}

/** Aquece o cache de token com um fluxo OAuth padrão bem-sucedido. */
async function warmToken(): Promise<void> {
  const { restore } = stubFetch(oauthHandler());
  try {
    await getVrAccessToken();
  } finally {
    restore();
  }
}

const SAMPLE_CARD: VrCardInput = {
  nome: "Fulano de Tal",
  numero_cartao: "1234567890123456",
  data_expiracao: "2812",
  cvv: "123",
  documento: "12345678900",
};

// ---------------------------------------------------------------------------
// (a) grant-code -> access-token
// ---------------------------------------------------------------------------

Deno.test("getVrAccessToken: grant-code -> access-token com client_id no header/body e Basic correto", async () => {
  setEnv();
  __resetVrClientCaches();

  const seen: { grantHeaders?: Headers; grantBody?: Record<string, unknown>; tokenHeaders?: Headers; tokenBody?: Record<string, unknown> } = {};
  const { restore } = stubFetch((url, init) => {
    if (url.includes("/oauth/grant-code")) {
      seen.grantHeaders = new Headers(init?.headers as HeadersInit);
      seen.grantBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ redirect_uri: "http://localhost/?code=abc123" }), { status: 200 });
    }
    if (url.includes("/oauth/access-token")) {
      seen.tokenHeaders = new Headers(init?.headers as HeadersInit);
      seen.tokenBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ access_token: "AT1", refresh_token: "RT1", expires_in: 3600 }), {
        status: 200,
      });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const token = await getVrAccessToken();
    assertEquals(token, "AT1");
    assertEquals(seen.grantHeaders?.get("client_id"), "test-client-id");
    assertEquals(seen.grantBody?.client_id, "test-client-id");
    assertEquals(seen.tokenBody?.grant_type, "authorization_code");
    assertEquals(seen.tokenBody?.code, "abc123");
    assert(seen.tokenHeaders?.get("authorization")?.startsWith("Basic "));
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// (b) token reutilizado
// ---------------------------------------------------------------------------

Deno.test("getVrAccessToken: reutiliza token em cache na 2a chamada", async () => {
  setEnv();
  __resetVrClientCaches();

  let oauthCalls = 0;
  const { restore } = stubFetch((url, init) => {
    if (url.includes("/oauth/")) oauthCalls++;
    return oauthHandler()(url, init);
  });

  try {
    const first = await getVrAccessToken();
    const second = await getVrAccessToken();
    assertEquals(first, second);
    // grant-code + access-token = 2 chamadas OAuth no total, não 4.
    assertEquals(oauthCalls, 2);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// (c) expirado -> refresh_token
// ---------------------------------------------------------------------------

Deno.test("getVrAccessToken: token expirado renova via refresh_token", async () => {
  setEnv();
  __resetVrClientCaches();

  let tokenCalls = 0;
  const { restore } = stubFetch((url, init) => {
    if (url.includes("/oauth/grant-code")) {
      return new Response(JSON.stringify({ redirect_uri: "http://localhost/?code=abc" }), { status: 200 });
    }
    if (url.includes("/oauth/access-token")) {
      tokenCalls++;
      const body = JSON.parse(String(init?.body));
      if (tokenCalls === 1) {
        assertEquals(body.grant_type, "authorization_code");
        // expires_in=1s: já cai dentro da margem de 60s no próximo check.
        return new Response(JSON.stringify({ access_token: "AT1", refresh_token: "RT1", expires_in: 1 }), {
          status: 200,
        });
      }
      assertEquals(body.grant_type, "refresh_token");
      assertEquals(body.refresh_token, "RT1");
      return new Response(JSON.stringify({ access_token: "AT2", refresh_token: "RT2", expires_in: 3600 }), {
        status: 200,
      });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const first = await getVrAccessToken();
    assertEquals(first, "AT1");
    const second = await getVrAccessToken();
    assertEquals(second, "AT2");
    assertEquals(tokenCalls, 2);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// refresh recusado (401) -> cai no grant-code em vez de travar com um
// refresh_token morto no cache
// ---------------------------------------------------------------------------

Deno.test("getVrAccessToken: refresh recusado com 401 cai no grant-code", async () => {
  setEnv();
  __resetVrClientCaches();

  let grantCalls = 0;
  let tokenCalls = 0;
  const { restore } = stubFetch((url, init) => {
    if (url.includes("/oauth/grant-code")) {
      grantCalls++;
      return new Response(JSON.stringify({ redirect_uri: "http://localhost/?code=abc" }), { status: 200 });
    }
    if (url.includes("/oauth/access-token")) {
      tokenCalls++;
      const body = JSON.parse(String(init?.body));
      if (tokenCalls === 1) {
        assertEquals(body.grant_type, "authorization_code");
        // expires_in=1s: já cai dentro da margem de 60s no próximo check.
        return new Response(JSON.stringify({ access_token: "AT1", refresh_token: "RT1", expires_in: 1 }), {
          status: 200,
        });
      }
      if (tokenCalls === 2) {
        assertEquals(body.grant_type, "refresh_token");
        assertEquals(body.refresh_token, "RT1");
        return new Response(JSON.stringify({ mensagem: "Refresh token expirado" }), { status: 401 });
      }
      // 3a chamada: novo grant-code -> access-token, depois da recusa do refresh.
      assertEquals(body.grant_type, "authorization_code");
      return new Response(JSON.stringify({ access_token: "AT2", refresh_token: "RT2", expires_in: 3600 }), {
        status: 200,
      });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const first = await getVrAccessToken();
    assertEquals(first, "AT1");

    // token expirado -> tenta refresh -> VR recusa -> refaz grant-code do zero
    const second = await getVrAccessToken();
    assertEquals(second, "AT2");
    assertEquals(grantCalls, 2, "1 grant-code inicial + 1 depois da recusa do refresh");
    assertEquals(tokenCalls, 3);

    // 3a chamada: token novo (AT2) ainda válido -> reutiliza cache, sem novo fetch.
    const third = await getVrAccessToken();
    assertEquals(third, "AT2");
    assertEquals(grantCalls, 2);
    assertEquals(tokenCalls, 3);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// (d) 401 -> força refresh e repete uma vez
// ---------------------------------------------------------------------------

Deno.test("vrFetch: 401 força forceRefresh e repete a chamada uma unica vez", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  let apiCalls = 0;
  let refreshCalls = 0;
  const { restore } = stubFetch((url, init) => {
    if (url.includes("/oauth/access-token")) {
      const body = JSON.parse(String(init?.body));
      if (body.grant_type === "refresh_token") refreshCalls++;
      return new Response(JSON.stringify({ access_token: "AT2", refresh_token: "RT2", expires_in: 3600 }), {
        status: 200,
      });
    }
    if (url.includes("/transacoes/pagamentos/")) {
      apiCalls++;
      if (apiCalls === 1) {
        return new Response(JSON.stringify({ mensagem: "Access Token inválido ou expirado" }), { status: 401 });
      }
      return new Response(JSON.stringify({ id_transacao: "tx1", status: "CONFIRMADA", valor: 1000 }), {
        status: 200,
      });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const result = await getTransaction("van-1");
    assertEquals(result.status, "CONFIRMADA");
    assertEquals(apiCalls, 2);
    assertEquals(refreshCalls, 1);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// (e) timeout -> vr_timeout, sem retry
// ---------------------------------------------------------------------------

Deno.test("vrFetch: timeout vira VrApiError vr_timeout e NAO tenta de novo", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  let apiCalls = 0;
  const { restore } = stubFetch((url) => {
    if (url.includes("/transacoes/pagamentos/")) {
      apiCalls++;
      // ponytail: simula o abort diretamente em vez de esperar os 30s reais
      // de VR_TIMEOUT_MS — prova o mapeamento de erro e o "sem retry",
      // não a fiação exata do AbortController.
      return Promise.reject(new DOMException("The signal has been aborted", "AbortError"));
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    let caught: unknown;
    try {
      await getTransaction("van-timeout");
    } catch (err) {
      caught = err;
    }
    assert(caught instanceof VrApiError, "deveria lançar VrApiError");
    assertEquals((caught as VrApiError).code, "vr_timeout");
    assertEquals(apiCalls, 1);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// (f) createPayment monta body certo e parseia TransacaoAutorizada
// ---------------------------------------------------------------------------

Deno.test("createPayment: body em centavos, 1 parcela, e parseia a resposta", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  let sentBody: Record<string, unknown> | undefined;
  const { restore } = stubFetch((url, init) => {
    if (url.endsWith("/transacoes/pagamentos")) {
      sentBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ id_transacao: "tx1", valor: 1500, codigo_retorno: "00", codigo_autorizacao: "A1B2C3", mensagem: "OK" }),
        { status: 201 },
      );
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const result = await createPayment({
      valorCents: 1500,
      idTransacaoVan: "abc123",
      keyId: "key-1",
      cardEncrypted: "base64==",
    });
    assertEquals(sentBody?.valor, 1500);
    assertEquals(sentBody?.quantidade_parcelas, 1);
    assertEquals(sentBody?.id_filiacao, "123456");
    assertEquals(sentBody?.id_transacao_van, "abc123");
    assertEquals(sentBody?.key_id, "key-1");
    assertEquals(sentBody?.cartao_dados_criptografados, "base64==");
    assertEquals(result.codigo_retorno, "00");
    assertEquals(result.id_transacao, "tx1");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// (g) getTransaction
// ---------------------------------------------------------------------------

Deno.test("getTransaction: GET /transacoes/pagamentos/{id} e parseia ConsultaTransacao", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  const { restore } = stubFetch((url) => {
    if (url.includes("/transacoes/pagamentos/van-abc")) {
      return new Response(
        JSON.stringify({ id_transacao: "vr-1", id_transacao_van: "van-abc", valor: 2000, status: "PENDENTE" }),
        { status: 200 },
      );
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const result = await getTransaction("van-abc");
    assertEquals(result.status, "PENDENTE");
    assertEquals(result.id_transacao, "vr-1");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// (h) refund idempotente
// ---------------------------------------------------------------------------

Deno.test("refund: no-op quando a transacao ja esta CANCELADA", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  let estornoCalled = false;
  const { restore } = stubFetch((url) => {
    if (url.includes("estornos")) {
      estornoCalled = true;
      return new Response(null, { status: 201 });
    }
    if (url.includes("/transacoes/pagamentos/")) {
      return new Response(JSON.stringify({ id_transacao: "tx1", status: "CANCELADA", valor: 1000 }), { status: 200 });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const result = await refund({ idTransacao: "tx1", valorCents: 1000 });
    assertEquals(result.noop, true);
    assertEquals(estornoCalled, false);
  } finally {
    restore();
  }
});

Deno.test("refund: chama o estorno quando a transacao esta CONFIRMADA", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  let estornoBody: Record<string, unknown> | undefined;
  const { restore } = stubFetch((url, init) => {
    if (url.includes("estornos")) {
      estornoBody = JSON.parse(String(init?.body));
      return new Response(null, { status: 201 });
    }
    if (url.includes("/transacoes/pagamentos/")) {
      return new Response(JSON.stringify({ id_transacao: "tx1", status: "CONFIRMADA", valor: 1000 }), { status: 200 });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const result = await refund({ idTransacao: "tx1", valorCents: 1000 });
    assertEquals(result.noop, false);
    assertEquals(estornoBody?.valor, 1000);
    assertEquals(estornoBody?.id_filiacao, "123456");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// createPayment: via cartaoTokenId (sem key_id/blob no body)
// ---------------------------------------------------------------------------

Deno.test("createPayment: via cartaoTokenId monta body sem key_id/cartao_dados_criptografados", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  let sentBody: Record<string, unknown> | undefined;
  const { restore } = stubFetch((url, init) => {
    if (url.endsWith("/transacoes/pagamentos")) {
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id_transacao: "tx1", valor: 1500, codigo_retorno: "00" }), { status: 201 });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    await createPayment({ valorCents: 1500, idTransacaoVan: "abc123", cartaoTokenId: "tok-1" });
    assertEquals(sentBody?.cartao_token_id, "tok-1");
    assertEquals(sentBody?.key_id, undefined);
    assertEquals(sentBody?.cartao_dados_criptografados, undefined);
  } finally {
    restore();
  }
});

Deno.test("createPayment: rejeita quando nenhuma via de cartão é informada", async () => {
  setEnv();
  __resetVrClientCaches();
  await assertRejects(() => createPayment({ valorCents: 100, idTransacaoVan: "abc" } as never));
});

Deno.test("createPayment: rejeita quando as duas vias de cartão são informadas", async () => {
  setEnv();
  __resetVrClientCaches();
  await assertRejects(() =>
    createPayment({
      valorCents: 100,
      idTransacaoVan: "abc",
      keyId: "k1",
      cardEncrypted: "enc",
      cartaoTokenId: "tok-1",
    } as never)
  );
});

// ---------------------------------------------------------------------------
// refund: reembolso parcial retorna o estorno parseado
// ---------------------------------------------------------------------------

Deno.test("refund: reembolso parcial (valorCents < total) retorna o estorno parseado", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  const { restore } = stubFetch((url) => {
    if (url.includes("estornos")) {
      return new Response(
        JSON.stringify({ id_transacao: "tx1", valor: 400, codigo_retorno: "00", codigo_autorizacao: "P1" }),
        { status: 201 },
      );
    }
    if (url.includes("/transacoes/pagamentos/")) {
      return new Response(JSON.stringify({ id_transacao: "tx1", status: "CONFIRMADA", valor: 1000 }), { status: 200 });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const result = await refund({ idTransacao: "tx1", valorCents: 400 });
    assertEquals(result.noop, false);
    assertEquals(result.estorno?.valor, 400);
    assertEquals(result.estorno?.codigo_retorno, "00");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// Reserva de valor: createReservation / getReservation / settleReservation
// ---------------------------------------------------------------------------

Deno.test("createReservation: POST /transacoes/pagamentos/reservas com o mesmo body de Transacao", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  let seenUrl = "";
  let sentBody: Record<string, unknown> | undefined;
  const { restore } = stubFetch((url, init) => {
    if (url.endsWith("/transacoes/pagamentos/reservas")) {
      seenUrl = url;
      sentBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ id_transacao: "res1", valor: 1500, status: "PENDENTE", codigo_retorno: "00" }),
        { status: 201 },
      );
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const result = await createReservation({ valorCents: 1500, idTransacaoVan: "van-r1", keyId: "k1", cardEncrypted: "enc" });
    assert(seenUrl.endsWith("/transacoes/pagamentos/reservas"));
    assertEquals(sentBody?.valor, 1500);
    assertEquals(sentBody?.id_transacao_van, "van-r1");
    assertEquals(result.id_transacao, "res1");
  } finally {
    restore();
  }
});

Deno.test("getReservation: GET /transacoes/pagamentos/reservas/{id}", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  const { restore } = stubFetch((url) => {
    if (url.includes("/transacoes/pagamentos/reservas/res-abc")) {
      return new Response(
        JSON.stringify({ id_transacao: "res-abc", valor: 2000, status: "PENDENTE", codigo_retorno: "00" }),
        { status: 200 },
      );
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const result = await getReservation("res-abc");
    assertEquals(result.status, "PENDENTE");
  } finally {
    restore();
  }
});

Deno.test("settleReservation: PATCH no path do Swagger ({id}/reservas), body EfetivaReserva", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  let seenUrl = "";
  let seenMethod = "";
  let sentBody: Record<string, unknown> | undefined;
  const { restore } = stubFetch((url, init) => {
    if (url.includes("/transacoes/pagamentos/") && url.endsWith("/reservas")) {
      seenUrl = url;
      seenMethod = init?.method ?? "";
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id_transacao: "res1", valor: 1500, codigo_retorno: "00" }), { status: 200 });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const result = await settleReservation({ idTransacao: "res1", acao: "efetivar", valorCents: 1500 });
    assertEquals(seenMethod, "PATCH");
    assert(seenUrl.includes("/transacoes/pagamentos/res1/reservas"), seenUrl);
    assertEquals(sentBody?.acao, "efetivar");
    assertEquals(sentBody?.valor, 1500);
    assertEquals(sentBody?.id_filiacao, "123456");
    assertEquals(result.codigo_retorno, "00");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// Tokenização
// ---------------------------------------------------------------------------

Deno.test("tokenizeCard: POST /cartoes com mes_validade/ano_validade inteiros", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  let sentBody: Record<string, unknown> | undefined;
  const { restore } = stubFetch((url, init) => {
    if (url.endsWith("/cartoes")) {
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ cartao_token_id: "tok-1", mensagens: [] }), { status: 201 });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const result = await tokenizeCard({
      numero_cartao: "4111111111111111",
      nome_impressao: "Fulano",
      cvv: "123",
      mes_validade: 12,
      ano_validade: 2028,
    });
    assertEquals(sentBody?.mes_validade, 12);
    assertEquals(sentBody?.ano_validade, 2028);
    assertEquals(result.cartao_token_id, "tok-1");
  } finally {
    restore();
  }
});

Deno.test("getTokenizedCard: GET /cartoes/{id} parseia CartaoTokenizado", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  const { restore } = stubFetch((url) => {
    if (url.includes("/cartoes/tok-1")) {
      return new Response(
        JSON.stringify({
          cartao: { cartao_token_id: "tok-1", ultimos4_digitos: "1111", status_cartao: "ATIVO" },
          mensagens: [],
        }),
        { status: 200 },
      );
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const result = await getTokenizedCard("tok-1");
    assertEquals(result.cartao.status_cartao, "ATIVO");
  } finally {
    restore();
  }
});

Deno.test("deleteTokenizedCard: DELETE /cartoes/{id}, 204 sem corpo", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  let seenMethod = "";
  const { restore } = stubFetch((url, init) => {
    if (url.includes("/cartoes/tok-1")) {
      seenMethod = init?.method ?? "";
      return new Response(null, { status: 204 });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    await deleteTokenizedCard("tok-1");
    assertEquals(seenMethod, "DELETE");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// (i) classifyReturnCode
// ---------------------------------------------------------------------------

Deno.test("classifyReturnCode: cobre cada classe do enum", () => {
  assertEquals(classifyReturnCode("00").classe, "aprovado");
  for (const codigo of ["03", "04", "63", "95", "97", "02"]) {
    assertEquals(classifyReturnCode(codigo).classe, "cartao", `codigo ${codigo}`);
  }
  assertEquals(classifyReturnCode("16").classe, "saldo");
  for (const codigo of ["60", "67", "D0"]) {
    assertEquals(classifyReturnCode(codigo).classe, "limite", `codigo ${codigo}`);
  }
  assertEquals(classifyReturnCode("17").classe, "duplicidade");
  for (const codigo of ["76", "C2", "C3", "11"]) {
    assertEquals(classifyReturnCode(codigo).classe, "negado", `codigo ${codigo}`);
  }
  for (const codigo of ["01", "10"]) {
    assertEquals(classifyReturnCode(codigo).classe, "erro_ec", `codigo ${codigo}`);
  }
  assertEquals(classifyReturnCode("99999-nao-existe").classe, "desconhecido");
});

// ---------------------------------------------------------------------------
// (j) newIdTransacaoVan
// ---------------------------------------------------------------------------

Deno.test("newIdTransacaoVan: <=15 chars, alfanumerico, sem colisao em 1000 geracoes", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const id = newIdTransacaoVan();
    assert(id.length <= 15, `id muito longo: ${id} (${id.length})`);
    assertMatch(id, /^[a-z0-9]+$/);
    assert(!seen.has(id), `colisão em ${id}`);
    seen.add(id);
  }
});

// ---------------------------------------------------------------------------
// (k) encryptCardData round-trip
// ---------------------------------------------------------------------------

function generateTestKeyPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

Deno.test("encryptCardData: round-trip OAEP-SHA256 (chave em PEM)", async () => {
  const { publicKey, privateKey } = generateTestKeyPair();
  const cipherB64 = await encryptCardData(publicKey, SAMPLE_CARD, "oaep-sha256");
  const plain = privateDecrypt(
    { key: privateKey, padding: nodeConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(cipherB64, "base64"),
  );
  assertEquals(JSON.parse(plain.toString("utf8")), SAMPLE_CARD);
});

Deno.test("encryptCardData: round-trip PKCS#1 v1.5 (chave em PEM)", async () => {
  const { publicKey, privateKey } = generateTestKeyPair();
  const cipherB64 = await encryptCardData(publicKey, SAMPLE_CARD, "pkcs1");
  const plain = privateDecrypt({ key: privateKey, padding: nodeConstants.RSA_PKCS1_PADDING }, Buffer.from(cipherB64, "base64"));
  assertEquals(JSON.parse(plain.toString("utf8")), SAMPLE_CARD);
});

Deno.test("encryptCardData: aceita chave publica em base64-de-PEM", async () => {
  const { publicKey, privateKey } = generateTestKeyPair();
  const b64Pem = btoa(publicKey);
  const cipherB64 = await encryptCardData(b64Pem, SAMPLE_CARD, "oaep-sha256");
  const plain = privateDecrypt(
    { key: privateKey, padding: nodeConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(cipherB64, "base64"),
  );
  assertEquals(JSON.parse(plain.toString("utf8")), SAMPLE_CARD);
});

Deno.test("encryptCardData: aceita chave publica DER SPKI em base64", async () => {
  const { publicKey: pemPub, privateKey } = generateTestKeyPair();
  const derPub = createPublicKey(pemPub).export({ type: "spki", format: "der" }) as Buffer;
  const derBase64 = derPub.toString("base64");
  const cipherB64 = await encryptCardData(derBase64, SAMPLE_CARD, "oaep-sha256");
  const plain = privateDecrypt(
    { key: privateKey, padding: nodeConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(cipherB64, "base64"),
  );
  assertEquals(JSON.parse(plain.toString("utf8")), SAMPLE_CARD);
});

Deno.test("encryptCardData: rejeita plaintext acima do limite do padding", async () => {
  const { publicKey } = generateTestKeyPair();
  const bigCard: VrCardInput = { ...SAMPLE_CARD, nome: "N".repeat(300) };
  await assertRejects(() => encryptCardData(publicKey, bigCard, "oaep-sha256"));
});

// ---------------------------------------------------------------------------
// (l) getPublicKey cacheado
// ---------------------------------------------------------------------------

Deno.test("getPublicKey: cacheada em modulo, 2a chamada nao busca de novo", async () => {
  setEnv();
  __resetVrClientCaches();
  await warmToken();

  let fetchCalls = 0;
  const { restore } = stubFetch((url) => {
    if (url.includes("/chaves/chave-publica")) {
      fetchCalls++;
      return new Response(JSON.stringify({ key_id: "k1", public_key: "abc" }), { status: 200 });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const first = await getPublicKey();
    const second = await getPublicKey();
    assertEquals(first, second);
    assertEquals(fetchCalls, 1);
  } finally {
    restore();
    invalidatePublicKeyCache();
  }
});

// ---------------------------------------------------------------------------
// (m) teste ao vivo — só roda com credenciais reais (VR_CLIENT_ID setado)
// ---------------------------------------------------------------------------

Deno.test({
  name: "LIVE: getPublicKey + createPayment 2x com o mesmo id_transacao_van (mock/hml reais)",
  ignore: !Deno.env.get("VR_CLIENT_ID"),
  async fn() {
    __resetVrClientCaches();
    const { key_id, public_key } = await getPublicKey();
    const idTransacaoVan = newIdTransacaoVan();
    const cardEncrypted = await encryptCardData(
      public_key,
      {
        nome: "Teste Spike",
        numero_cartao: "4111111111111111",
        data_expiracao: "1230",
        cvv: "123",
        documento: "00000000000",
      },
      "oaep-sha256",
    );

    const first = await createPayment({ valorCents: 100, idTransacaoVan, keyId: key_id, cardEncrypted });
    // Nunca logar corpo — só o codigo_retorno, que já é o vocabulário público da VR.
    console.log(`[vr live] 1a chamada codigo_retorno=${first.codigo_retorno}`);

    try {
      const second = await createPayment({ valorCents: 100, idTransacaoVan, keyId: key_id, cardEncrypted });
      console.log(`[vr live] 2a chamada (mesmo id_transacao_van) codigo_retorno=${second.codigo_retorno}`);
    } catch (err) {
      if (err instanceof VrApiError) {
        console.log(`[vr live] 2a chamada erro code=${err.code} codigo=${err.codigo ?? ""}`);
      } else {
        throw err;
      }
    }
  },
});

// ---------------------------------------------------------------------------
// (bônus) forceRefreshVrAccessToken sem refresh_token cacheado faz grant novo
// ---------------------------------------------------------------------------

Deno.test("forceRefreshVrAccessToken: sem cache, refaz o grant-code do zero", async () => {
  setEnv();
  __resetVrClientCaches();

  let grantCalls = 0;
  const { restore } = stubFetch((url, init) => {
    if (url.includes("/oauth/grant-code")) {
      grantCalls++;
      return new Response(JSON.stringify({ redirect_uri: "http://localhost/?code=abc" }), { status: 200 });
    }
    if (url.includes("/oauth/access-token")) {
      return new Response(JSON.stringify({ access_token: "AT1", refresh_token: "RT1", expires_in: 3600 }), {
        status: 200,
      });
    }
    throw new Error(`URL inesperada ${url}`);
  });

  try {
    const token = await forceRefreshVrAccessToken();
    assertEquals(token, "AT1");
    assertEquals(grantCalls, 1);
  } finally {
    restore();
  }
});
