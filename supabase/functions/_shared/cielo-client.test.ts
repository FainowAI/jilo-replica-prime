import { assert, assertEquals, assertMatch, assertRejects } from "jsr:@std/assert";
import {
  __resetCieloClientForTests,
  CieloApiError,
  type CieloSale,
  classifyReturnCode,
  createVoucherSale,
  findSalesByMerchantOrderId,
  getCieloEnv,
  getSale,
  getSopAccessToken,
  isApproved,
  isTerminal,
  newMerchantOrderId,
  sopEnvironment,
  voidSale,
} from "./cielo-client.ts";

const KEY = "SENTINEL-MERCHANT-KEY-123";
const SECRET = "SENTINEL-SOP-SECRET-456";
const PAYMENT_TOKEN = "SENTINEL-PAYMENT-TOKEN-789";
const HOLDER = "SENTINEL HOLDER NAME";

function setEnv(env = "sandbox"): void {
  Deno.env.set("CIELO_ENV", env);
  Deno.env.set("CIELO_MERCHANT_ID", "merchant-id-1");
  Deno.env.set("CIELO_MERCHANT_KEY", KEY);
  Deno.env.set("CIELO_SOP_CLIENT_ID", "sop-client");
  Deno.env.set("CIELO_SOP_CLIENT_SECRET", SECRET);
  Deno.env.delete("CIELO_MOCK_BASE_URL");
  __resetCieloClientForTests();
}

type Call = { url: string; init: RequestInit | undefined };
type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

/** Stub de fetch + espião de console; restaura tudo no fim. Devolve as chamadas e os logs. */
async function withStubs(handler: Handler, fn: (calls: Call[], logs: string[]) => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const origs = { log: console.log, error: console.error, warn: console.warn };
  const calls: Call[] = [];
  const logs: string[] = [];
  const spy = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  console.log = console.error = console.warn = spy;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
  try {
    await fn(calls, logs);
  } finally {
    globalThis.fetch = original;
    Object.assign(console, origs);
    __resetCieloClientForTests();
  }
}

const jsonRes = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

const saleJson = (over: Record<string, unknown> = {}) => ({
  MerchantOrderId: "JAORDER1",
  Customer: { Name: HOLDER },
  Payment: {
    PaymentId: "pay-1",
    Amount: 5990,
    Status: 2,
    ReturnCode: "00",
    ReturnMessage: "Operation Successful",
    Tid: "T1",
    ProofOfSale: "P1",
    AuthorizationCode: "A1",
    DebitCard: { CardNumber: "508054******8044", Holder: HOLDER, Brand: "Elo" },
    Links: [{ Href: "x" }],
    ...over,
  },
});

const hdr = (init: RequestInit | undefined, name: string) => (init?.headers as Record<string, string>)[name];

Deno.test("getCieloEnv: sem default, ausente/inválido falha fechado", () => {
  setEnv();
  Deno.env.delete("CIELO_ENV");
  const e = (() => { try { getCieloEnv(); } catch (x) { return x as CieloApiError; } })();
  assert(e instanceof CieloApiError);
  assertEquals(e.code, "cielo_env_invalid");
  Deno.env.set("CIELO_ENV", "hml");
  assertEquals((() => { try { getCieloEnv(); } catch (x) { return (x as CieloApiError).code; } })(), "cielo_env_invalid");
  Deno.env.set("CIELO_ENV", "prod");
  assertEquals(getCieloEnv(), "prod");
});

Deno.test("sopEnvironment: prod -> production, demais -> sandbox", () => {
  assertEquals(sopEnvironment("prod"), "production");
  assertEquals(sopEnvironment("sandbox"), "sandbox");
  assertEquals(sopEnvironment("mock"), "sandbox");
});

Deno.test("hosts fixos por env (sandbox e prod)", async () => {
  for (
    const [env, api, query] of [
      ["sandbox", "https://apisandbox.cieloecommerce.cielo.com.br", "https://apiquerysandbox.cieloecommerce.cielo.com.br"],
      ["prod", "https://api.cieloecommerce.cielo.com.br", "https://apiquery.cieloecommerce.cielo.com.br"],
    ] as const
  ) {
    setEnv(env);
    await withStubs(() => jsonRes(saleJson()), async (calls) => {
      await createVoucherSale({ merchantOrderId: "JAORDER1", amountCents: 5990, paymentToken: PAYMENT_TOKEN, holderName: HOLDER });
      await getSale("pay-1");
      assertEquals(calls[0].url, `${api}/v2/sales/`);
      assertEquals(calls[1].url, `${query}/1/sales/pay-1`);
    });
  }
});

Deno.test("mock: só aceita loopback http; CIELO_MOCK_BASE_URL ignorada fora de mock", async () => {
  setEnv("mock");
  Deno.env.set("CIELO_MOCK_BASE_URL", "https://evil.example.com");
  await assertRejects(() => getSale("x"), CieloApiError, "cielo_env_invalid");
  Deno.env.set("CIELO_MOCK_BASE_URL", "http://localhost:9999/");
  await withStubs(() => jsonRes(saleJson()), async (calls) => {
    await getSale("pay-1");
    assertEquals(calls[0].url, "http://localhost:9999/1/sales/pay-1");
  });
  setEnv("sandbox");
  Deno.env.set("CIELO_MOCK_BASE_URL", "http://127.0.0.1:9999");
  await withStubs(() => jsonRes(saleJson()), async (calls) => {
    await getSale("pay-1");
    assert(calls[0].url.startsWith("https://apiquerysandbox."));
  });
});

Deno.test("createVoucherSale: payload exato, headers e parser descarta PAN/Holder", async () => {
  setEnv();
  await withStubs(() => jsonRes(saleJson(), 201), async (calls) => {
    const sale = await createVoucherSale({
      merchantOrderId: "JAORDER1",
      amountCents: 5990,
      paymentToken: PAYMENT_TOKEN,
      holderName: HOLDER,
      softDescriptor: "JILO",
    });
    assertEquals(JSON.parse(String(calls[0].init?.body)), {
      MerchantOrderId: "JAORDER1",
      Customer: { Name: HOLDER },
      Payment: {
        Type: "DebitCard",
        Amount: 5990,
        Installments: 1,
        Authenticate: false,
        SoftDescriptor: "JILO",
        DebitCard: { PaymentToken: PAYMENT_TOKEN, Brand: "Elo" },
      },
    });
    assertEquals(calls[0].init?.method, "POST");
    assertEquals(hdr(calls[0].init, "MerchantId"), "merchant-id-1");
    assertEquals(hdr(calls[0].init, "MerchantKey"), KEY);
    assertEquals(hdr(calls[0].init, "Content-Type"), "application/json");
    assertMatch(hdr(calls[0].init, "RequestId"), /^[0-9a-f-]{36}$/);
    assertEquals(sale, {
      paymentId: "pay-1",
      merchantOrderId: "JAORDER1",
      status: 2,
      returnCode: "00",
      returnMessage: "Operation Successful",
      amountCents: 5990,
      tid: "T1",
      proofOfSale: "P1",
      authorizationCode: "A1",
    });
    const dump = JSON.stringify(sale);
    assert(!dump.includes("508054") && !dump.includes(HOLDER) && !dump.includes("Links"));
    assert(isApproved(sale));
  });
});

Deno.test("createVoucherSale: sem retry em 5xx, e timeout/rede -> cielo_timeout", async () => {
  setEnv();
  const input = { merchantOrderId: "JAORDER1", amountCents: 100, paymentToken: PAYMENT_TOKEN, holderName: HOLDER };
  await withStubs(() => new Response("boom", { status: 502 }), async (calls) => {
    const e = await assertRejects(() => createVoucherSale(input), CieloApiError);
    assertEquals(e.code, "cielo_http_502");
    assertEquals(calls.length, 1);
  });
  await withStubs(() => Promise.reject(new TypeError("network down")), async (calls) => {
    const e = await assertRejects(() => createVoucherSale(input), CieloApiError);
    assertEquals(e.code, "cielo_timeout");
    assertEquals(calls.length, 1);
  });
  // timeout real via AbortController (timeout curto de teste)
  __resetCieloClientForTests({ timeoutMs: 30 });
  const original = globalThis.fetch;
  globalThis.fetch = ((_u: unknown, init?: RequestInit) =>
    new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;
  try {
    const e = await assertRejects(() => createVoucherSale(input), CieloApiError);
    assertEquals(e.code, "cielo_timeout");
  } finally {
    globalThis.fetch = original;
    __resetCieloClientForTests();
  }
});

Deno.test("createVoucherSale: valor inválido e resposta sem Payment", async () => {
  setEnv();
  const base = { merchantOrderId: "JAORDER1", paymentToken: PAYMENT_TOKEN, holderName: HOLDER };
  await assertRejects(() => createVoucherSale({ ...base, amountCents: 10.5 }), Error, "Valor inválido");
  await withStubs(() => jsonRes({ MerchantOrderId: "JAORDER1" }, 201), async () => {
    const e = await assertRejects(() => createVoucherSale({ ...base, amountCents: 100 }), CieloApiError);
    assertEquals(e.code, "cielo_bad_response");
  });
});

Deno.test("findSalesByMerchantOrderId: vazio -> [], erro HTTP/corpo estranho -> throw", async () => {
  setEnv();
  await withStubs(() => jsonRes({ Payments: [] }), async (calls) => {
    assertEquals(await findSalesByMerchantOrderId("JA 1"), []);
    assertEquals(calls[0].url, "https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales?merchantOrderId=JA%201");
  });
  await withStubs(() => jsonRes({ Payments: [{ PaymentId: "a" }, { PaymentId: "b" }] }), async () => {
    assertEquals(await findSalesByMerchantOrderId("JA1"), ["a", "b"]);
  });
  await withStubs(() => new Response("", { status: 500 }), async () => {
    await assertRejects(() => findSalesByMerchantOrderId("JA1"), CieloApiError, "cielo_http_500");
  });
  await withStubs(() => jsonRes({ foo: 1 }), async () => {
    await assertRejects(() => findSalesByMerchantOrderId("JA1"), CieloApiError, "cielo_bad_response");
  });
});

Deno.test("voidSale: no-op em 10/11; senão PUT void?amount=", async () => {
  setEnv();
  for (const status of [10, 11]) {
    await withStubs(() => jsonRes(saleJson({ Status: status })), async (calls) => {
      const s = await voidSale("pay-1", 5990);
      assertEquals(s.status, status);
      assertEquals(calls.length, 1); // só a consulta
    });
  }
  await withStubs(
    (_u, init) =>
      init?.method === "PUT"
        ? jsonRes({ Status: 10, ReturnCode: "0", ReturnMessage: "Operation Successful" })
        : jsonRes(saleJson()),
    async (calls) => {
      const s = await voidSale("pay-1", 5990);
      assertEquals(calls.length, 2);
      assertEquals(calls[1].init?.method, "PUT");
      assertEquals(calls[1].url, "https://apisandbox.cieloecommerce.cielo.com.br/1/sales/pay-1/void?amount=5990");
      assertEquals(s.status, 10);
      assertEquals(s.paymentId, "pay-1");
    },
  );
});

Deno.test("isApproved / isTerminal / classifyReturnCode", () => {
  const sale = (status: number, returnCode: string): CieloSale => ({
    paymentId: "p", merchantOrderId: "m", status, returnCode, amountCents: 1,
  });
  for (const c of ["00", "4", "6"]) assert(isApproved(sale(2, c)));
  assert(!isApproved(sale(2, "51")));
  assert(!isApproved(sale(1, "00")));
  for (const s of [2, 3, 10, 11, 13]) assert(isTerminal(s));
  for (const s of [0, 1, 12, 99, -1]) assert(!isTerminal(s));
  assertEquals(classifyReturnCode("51"), { kind: "declined_balance", userMessage: "Saldo insuficiente no cartão Alelo." });
  for (const c of ["54", "57", "78", "05"]) assertEquals(classifyReturnCode(c).kind, "declined_card");
  assertEquals(classifyReturnCode("00").kind, "approved");
  assertEquals(classifyReturnCode("ZZ").kind, "declined_other");
  assertEquals(classifyReturnCode("").kind, "error");
});

Deno.test("newMerchantOrderId: JA + 18 alfanuméricos, único", () => {
  const a = newMerchantOrderId();
  assertMatch(a, /^JA[A-Za-z0-9]{18}$/);
  assert(a !== newMerchantOrderId());
});

Deno.test("getSopAccessToken: OAuth Basic, cache do bearer, MerchantId no accesstoken", async () => {
  setEnv();
  let oauthCalls = 0;
  await withStubs(
    (url) => {
      if (url.includes("/oauth2/token")) {
        oauthCalls++;
        return jsonRes({ access_token: "bearer-1", expires_in: 1199 });
      }
      return jsonRes({ AccessToken: "sop-tok", ExpiresIn: 1200 });
    },
    async (calls, logs) => {
      const r = await getSopAccessToken();
      assertEquals(r, { accessToken: "sop-tok", expiresIn: 1200 });
      await getSopAccessToken();
      assertEquals(oauthCalls, 1); // bearer em cache
      assertEquals(calls[0].url, "https://authsandbox.braspag.com.br/oauth2/token");
      assertEquals(hdr(calls[0].init, "Authorization"), `Basic ${btoa(`sop-client:${SECRET}`)}`);
      assertEquals(String(calls[0].init?.body), "grant_type=client_credentials");
      assertEquals(calls[1].url, "https://transactionsandbox.pagador.com.br/post/api/public/v2/accesstoken");
      assertEquals(hdr(calls[1].init, "Authorization"), "Bearer bearer-1");
      assertEquals(hdr(calls[1].init, "MerchantId"), "merchant-id-1");
      assert(!logs.join("\n").includes("sop-tok") && !logs.join("\n").includes("bearer-1"));
    },
  );
});

Deno.test("logs nunca contêm MerchantKey, tokens ou holder", async () => {
  setEnv();
  await withStubs(
    (url, init) => {
      if (url.includes("/oauth2/token")) return jsonRes({ access_token: "SENTINEL-BEARER", expires_in: 1199 });
      if (url.includes("accesstoken")) return jsonRes({ AccessToken: "SENTINEL-SOP", ExpiresIn: 100 });
      if (init?.method === "PUT") return jsonRes({ Status: 10 });
      if (url.includes("merchantOrderId")) return jsonRes({ Payments: [{ PaymentId: "pay-1" }] });
      return jsonRes(saleJson(), 201);
    },
    async (_c, logs) => {
      await getSopAccessToken();
      await createVoucherSale({ merchantOrderId: "JAORDER1", amountCents: 5990, paymentToken: PAYMENT_TOKEN, holderName: HOLDER });
      await findSalesByMerchantOrderId("JAORDER1");
      await getSale("pay-1");
      await voidSale("pay-1", 5990);
      const all = logs.join("\n");
      assert(all.includes("[cielo] POST /v2/sales/ -> 201 JAORDER1"));
      for (const s of [KEY, SECRET, PAYMENT_TOKEN, HOLDER, "SENTINEL-BEARER", "SENTINEL-SOP", "pay-1", "508054"]) {
        assert(!all.includes(s), `log vazou ${s}`);
      }
    },
  );
  // erro de rede: só err.name
  await withStubs(() => Promise.reject(new TypeError(`falha com ${KEY}`)), async (_c, logs) => {
    await assertRejects(() => getSale("pay-1"), CieloApiError);
    assert(!logs.join("\n").includes(KEY));
    assert(logs.join("\n").includes("TypeError"));
  });
});
