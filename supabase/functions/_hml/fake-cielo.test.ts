/**
 * Testes do dublê `fake-cielo.ts`: sobe em porta efêmera (loopback) e exercita
 * o `cielo-client.ts` real com CIELO_ENV=mock. Requer --allow-net=127.0.0.1.
 */
import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { startFakeCielo } from "./fake-cielo.ts";
import {
  __resetCieloClientForTests,
  CieloApiError,
  classifyReturnCode,
  createVoucherSale,
  findSalesByMerchantOrderId,
  getSale,
  getSopAccessToken,
  isApproved,
  isTerminal,
  newMerchantOrderId,
  voidSale,
} from "../_shared/cielo-client.ts";

async function withFake(fn: (fake: ReturnType<typeof startFakeCielo>) => Promise<void>, hangMs = 31_000) {
  const fake = startFakeCielo({ hangMs });
  Deno.env.set("CIELO_ENV", "mock");
  Deno.env.set("CIELO_MOCK_BASE_URL", fake.baseUrl);
  Deno.env.set("CIELO_MERCHANT_ID", "mid");
  Deno.env.set("CIELO_MERCHANT_KEY", "mkey");
  Deno.env.set("CIELO_SOP_CLIENT_ID", "cid");
  Deno.env.set("CIELO_SOP_CLIENT_SECRET", "csecret");
  __resetCieloClientForTests();
  const quiet = { log: console.log, error: console.error };
  console.log = console.error = () => {};
  try {
    await fn(fake);
  } finally {
    Object.assign(console, quiet);
    __resetCieloClientForTests();
    await fake.stop();
  }
}

const sale = (paymentToken: string, merchantOrderId = newMerchantOrderId()) =>
  createVoucherSale({ merchantOrderId, amountCents: 7900, paymentToken, holderName: "FULANO TESTE" });

Deno.test("fake: aprovado, consulta, e parser sem PAN/Holder", async () => {
  await withFake(async () => {
    const s = await sale("tok-ok");
    assert(isApproved(s));
    assertEquals(s.amountCents, 7900);
    assert(!JSON.stringify(s).includes("TITULAR") && !JSON.stringify(s).includes("508054"));
    assertEquals(await getSale(s.paymentId), s);
    assertEquals(await findSalesByMerchantOrderId(s.merchantOrderId), [s.paymentId]);
    assertEquals(await findSalesByMerchantOrderId("JAINEXISTENTE000000"), []);
  });
});

Deno.test("fake: saldo insuficiente (51), cartão inválido (57), pendente (12)", async () => {
  await withFake(async () => {
    const saldo = await sale("tok-SALDO");
    assert(!isApproved(saldo) && isTerminal(saldo.status));
    assertEquals(classifyReturnCode(saldo.returnCode).kind, "declined_balance");
    const inv = await sale("tok-INVALIDO");
    assertEquals(classifyReturnCode(inv.returnCode).kind, "declined_card");
    const pend = await sale("tok-PENDENTE");
    assertEquals(pend.status, 12);
    assert(!isTerminal(pend.status) && !isApproved(pend));
  });
});

Deno.test("fake: timeout -> cielo_timeout e a venda existe (reconciliável por merchantOrderId)", async () => {
  await withFake(async (fake) => {
    __resetCieloClientForTests({ timeoutMs: 100 });
    const moid = newMerchantOrderId();
    const e = await assertRejects(() => sale("tok-TIMEOUT", moid), CieloApiError);
    assertEquals(e.code, "cielo_timeout");
    __resetCieloClientForTests();
    const ids = await findSalesByMerchantOrderId(moid);
    assertEquals(ids.length, 1);
    assertEquals(fake.sales.get(ids[0])?.status, 2);
  }, 400);
});

Deno.test("fake: void total, idempotente; parcial é recusado", async () => {
  await withFake(async () => {
    const s = await sale("tok-ok");
    await assertRejects(() => voidSale(s.paymentId, 100), CieloApiError, "cielo_http_400");
    assertEquals((await voidSale(s.paymentId, 7900)).status, 10);
    assertEquals((await voidSale(s.paymentId, 7900)).status, 10); // no-op
    assertEquals((await getSale(s.paymentId)).status, 10);
  });
});

Deno.test("fake: SOP token via OAuth + accesstoken", async () => {
  await withFake(async () => {
    const r = await getSopAccessToken();
    assertEquals(r.accessToken, "fake-sop-token");
    assert(r.expiresIn > 1000);
  });
});
