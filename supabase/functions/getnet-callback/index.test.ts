/** Testes do `getnet-callback` — 100% em memória, deps stubados, sem rede. */
import { assert, assertEquals, assertFalse } from "jsr:@std/assert";
import {
  handleGetnetCallback,
  type CallbackPatch,
  type CallbackRow,
  type GetnetCallbackDeps,
  type NewCallback,
  type ShopifyOrderLite,
} from "./handler.ts";

const SECRET = "S3cretS3cretS3cretS3cretS3cret_-ab"; // 34 chars, [A-Za-z0-9_-]
const PREV = "Pr3vPr3vPr3vPr3vPr3vPr3vPr3vPr3v_-cd";
const RSECRET = "R3concileR3concileR3concile_-xyz12"; // GETNET_RECONCILE_SECRET (distinto do segredo do path)
const PAY = "11111111-2222-4333-8444-555555555555";
const ORDER_ID = "rX6oAbCdEfGhIjKlMnOpQrStU"; // 25 chars
const NOW = new Date("2026-10-13T15:00:00.000Z");
const CREATED = new Date(NOW.getTime() - 10_000).toISOString(); // pedido de 10 s atrás

const GOOD_QUERY = { order_id: ORDER_ID, payment_id: PAY, amount: "16994", payment_type: "credit", status: "APPROVED" };

function order(over: Partial<ShopifyOrderLite> = {}): ShopifyOrderLite {
  return {
    id: "gid://shopify/Order/1026",
    name: "#1026",
    createdAt: CREATED,
    cancelledAt: null,
    displayFinancialStatus: "PENDING",
    canMarkAsPaid: true,
    currencyCode: "BRL",
    totalOutstandingCents: 16994,
    transactions: [{ paymentId: ORDER_ID, kind: "SALE", status: "PENDING", gateway: "Getnet" }],
    ...over,
  };
}

function url(query: Record<string, string> | string | null = GOOD_QUERY, secret: string = SECRET, path = "/functions/v1/getnet-callback/"): string {
  const qs = query === null ? "" : typeof query === "string" ? query : new URLSearchParams(query).toString();
  return `http://localhost${path}${secret}${qs ? `?${qs}` : ""}`;
}

const get = (u: string) => new Request(u, { method: "GET" });

interface Spy {
  deps: GetnetCallbackDeps;
  rows: CallbackRow[];
  calls: string[];
  inserts: NewCallback[];
  patches: { id: string; patch: CallbackPatch }[];
  forwarded: string[];
  bg: Promise<unknown>[];
  /** `limit` de cada `listPending`. */
  lists: number[];
  /** ids de cada `claim` tentado. */
  claims: string[];
  heartbeats: string[];
}

interface Opts {
  env?: Partial<GetnetCallbackDeps["env"]>;
  /** Resposta de `findOrders` por número da chamada (1, 2, ...) e pelo payment id buscado. */
  orders?: (n: number, paymentId: string) => ShopifyOrderLite[];
  markAsPaid?: () => Promise<{ ok: boolean }>;
  addTag?: () => Promise<void>;
  failInsert?: boolean;
  paidSince?: number;
  forward?: (u: string) => Promise<boolean>;
  /** true => `shopify_admin_http_429`; string => essa mensagem de erro. */
  findThrows?: boolean | string;
  failList?: boolean;
  failCount?: boolean;
  failHeartbeat?: boolean;
  /** O claim sempre perde (outra execução já levou a linha). */
  claimTaken?: boolean;
  /** O claim dessa linha lança (falha de DB). */
  claimThrowsFor?: string;
  /** `listPending` só devolve depois que N chamadas chegaram (força a corrida entre duas execuções). */
  listBarrier?: number;
}

function build(o: Opts = {}): Spy {
  const rows: CallbackRow[] = [];
  const calls: string[] = [];
  const inserts: NewCallback[] = [];
  const patches: Spy["patches"] = [];
  const forwarded: string[] = [];
  const bg: Promise<unknown>[] = [];
  const lists: number[] = [];
  const claims: string[] = [];
  const heartbeats: string[] = [];
  const waiters: (() => void)[] = [];
  const inQueue = (r: CallbackRow) => r.state === "received" || r.state === "pending";
  let finds = 0;
  const deps: GetnetCallbackDeps = {
    env: {
      GETNET_CALLBACK_ENABLED: "true",
      GETNET_CALLBACK_LIVE: "true",
      GETNET_CALLBACK_SECRET: SECRET,
      GETNET_CALLBACK_SECRET_PREV: null,
      GETNET_RECONCILE_SECRET: RSECRET,
      GETNET_AUTOPAY_MAX_CENTS: null,
      GETNET_AUTOPAY_RECENCY_MIN: null,
      GETNET_AUTOPAY_MAX_PER_HOUR: null,
      GETNET_FORWARD_PIX_URL: null,
      GETNET_FORWARD_CREDIT_URL: null,
      ...o.env,
    },
    db: {
      async insert(i) {
        inserts.push(i);
        if (o.failInsert) throw new Error("getnet_callbacks_insert_failed:08006");
        if (rows.some((r) => r.getnet_payment_id === i.getnet_payment_id && r.status_getnet === i.status_getnet)) return { ok: false, code: "23505" };
        const row: CallbackRow = { id: `row-${rows.length + 1}`, ...i, state: "received", attempts: 0, error: null, received_at: NOW.toISOString(), locked_until: null };
        rows.push(row);
        return { ok: true, row };
      },
      async getByKey(p, s) {
        return rows.find((r) => r.getnet_payment_id === p && r.status_getnet === s) ?? null;
      },
      async hasPaidApproval(p) {
        return rows.some((r) => r.getnet_payment_id === p && r.status_getnet === "APPROVED" && r.state === "done");
      },
      async countPaidSince() {
        return o.paidSince ?? 0;
      },
      async update(id, patch) {
        patches.push({ id, patch });
        Object.assign(rows.find((r) => r.id === id) ?? {}, patch);
      },
      async listPending(limit) {
        lists.push(limit);
        if (o.failList) throw new Error("getnet_callbacks_list_failed");
        // Como no SQL: attempts asc, received_at asc, limit. NÃO filtra por lease — o claim é a única autoridade.
        const snap = rows
          .filter(inQueue)
          .sort((a, b) => a.attempts - b.attempts || a.received_at.localeCompare(b.received_at))
          .slice(0, limit)
          .map((r) => ({ ...r }));
        if (o.listBarrier) {
          await new Promise<void>((res) => {
            waiters.push(res);
            if (waiters.length >= o.listBarrier!) waiters.forEach((w) => w());
          });
        }
        return snap;
      },
      // Atômico como o UPDATE condicional: confere e grava sem nenhum `await` no meio.
      async claim(id, leaseUntilIso, nowIso) {
        claims.push(id);
        if (o.claimThrowsFor === id) throw new Error("getnet_callbacks_claim_failed");
        const r = rows.find((x) => x.id === id);
        if (o.claimTaken || !r || !inQueue(r) || (r.locked_until !== null && r.locked_until >= nowIso)) return null;
        r.locked_until = leaseUntilIso;
        return { ...r };
      },
      async countQueue() {
        if (o.failCount) throw new Error("getnet_callbacks_count_failed");
        return rows.filter(inQueue).length;
      },
      async countReceivedSince(sinceIso) {
        if (o.failCount) throw new Error("getnet_callbacks_count_failed");
        return rows.filter((r) => r.received_at > sinceIso).length;
      },
      async heartbeat(nowIso) {
        if (o.failHeartbeat) throw new Error("getnet_callback_heartbeat_failed");
        heartbeats.push(nowIso);
      },
    },
    shopify: {
      async findOrders(paymentId) {
        calls.push(`find:${paymentId}`);
        finds++;
        if (o.findThrows) throw new Error(typeof o.findThrows === "string" ? o.findThrows : "shopify_admin_http_429");
        return (o.orders ?? (() => [order()]))(finds, paymentId);
      },
      async markAsPaid(id) {
        calls.push(`mark:${id}`);
        return o.markAsPaid ? await o.markAsPaid() : { ok: true };
      },
      async addTag(id, tag) {
        calls.push(`tag:${id}:${tag}`);
        if (o.addTag) await o.addTag();
      },
    },
    async forward(u) {
      forwarded.push(u);
      return o.forward ? await o.forward(u) : true;
    },
    waitUntil: (p) => {
      bg.push(p);
    },
    now: () => NOW,
  };
  return { deps, rows, calls, inserts, patches, forwarded, bg, lists, claims, heartbeats };
}

async function run(s: Spy, u: string, method = "GET"): Promise<Response> {
  const res = await handleGetnetCallback(new Request(u, { method }), s.deps);
  await Promise.all(s.bg); // deixa o repasse terminar
  return res;
}

const mutations = (s: Spy) => s.calls.filter((c) => c.startsWith("mark:") || c.startsWith("tag:")).length;
const states = (s: Spy) => s.rows.map((r) => r.state);

// ---------------------------------------------------------------------------
// Segredo / kill-switch / método / path (S-01, S-04.1, S-14)
// ---------------------------------------------------------------------------

Deno.test("segredo errado => 404 genérico, nada gravado nem consultado", async () => {
  const s = build();
  const res = await run(s, url(GOOD_QUERY, "x".repeat(34)));
  assertEquals(res.status, 404);
  assertEquals(s.inserts.length, 0);
  assertEquals(s.calls.length, 0);
  const other = await run(build({ env: { GETNET_CALLBACK_ENABLED: null } }), url());
  assertEquals(await res.text(), await other.text()); // corpo idêntico em todos os 404
});

Deno.test("S-01: secret ausente/vazio/curto/fora do charset + segmento vazio => 404", async () => {
  for (const bad of [null, "", "curto", "a".repeat(31), `${"a".repeat(31)}+`, `${"a".repeat(31)}%`]) {
    const s = build({ env: { GETNET_CALLBACK_SECRET: bad } });
    assertEquals((await run(s, url(GOOD_QUERY, ""))).status, 404, `segmento vazio com secret=${bad}`);
    assertEquals((await run(s, url(GOOD_QUERY, bad ?? ""))).status, 404, `segmento igual ao secret inválido=${bad}`);
    assertEquals(s.inserts.length, 0);
  }
});

Deno.test("S-04.1: PREV aceito; PREV inválido é excluído; SECRET inválido derruba até com PREV válido", async () => {
  const s = build({ env: { GETNET_CALLBACK_SECRET_PREV: PREV } });
  assertEquals((await run(s, url(GOOD_QUERY, SECRET))).status, 200);
  assertEquals((await run(s, url({ ...GOOD_QUERY, payment_id: "99999999-2222-4333-8444-555555555555" }, PREV))).status, 200);
  assertEquals(s.inserts.length, 2);

  const badPrev = build({ env: { GETNET_CALLBACK_SECRET_PREV: "curto" } });
  assertEquals((await run(badPrev, url(GOOD_QUERY, "curto"))).status, 404);
  assertEquals((await run(badPrev, url(GOOD_QUERY, SECRET))).status, 200);

  const badSecret = build({ env: { GETNET_CALLBACK_SECRET: "curto", GETNET_CALLBACK_SECRET_PREV: PREV } });
  assertEquals((await run(badSecret, url(GOOD_QUERY, PREV))).status, 404);
  assertEquals(badSecret.inserts.length, 0);
});

Deno.test("kill-switch (ausente ou != true), método != GET, path com segmento extra/ausente/barra final => 404", async () => {
  assertEquals((await run(build({ env: { GETNET_CALLBACK_ENABLED: null } }), url())).status, 404);
  assertEquals((await run(build({ env: { GETNET_CALLBACK_ENABLED: "false" } }), url())).status, 404);
  const s = build();
  for (const method of ["POST", "PUT", "DELETE", "HEAD"]) assertEquals((await run(s, url(), method)).status, 404, method);
  assertEquals((await run(s, `http://localhost/functions/v1/getnet-callback/${SECRET}/extra?${new URLSearchParams(GOOD_QUERY)}`)).status, 404);
  assertEquals((await run(s, `http://localhost/functions/v1/getnet-callback/${SECRET}/?${new URLSearchParams(GOOD_QUERY)}`)).status, 404);
  assertEquals((await run(s, `http://localhost/functions/v1/getnet-callback?${new URLSearchParams(GOOD_QUERY)}`)).status, 404);
  assertEquals((await run(s, `http://localhost/functions/v1/getnet-callback//?${new URLSearchParams(GOOD_QUERY)}`)).status, 404);
  assertEquals((await run(s, `http://localhost/outra-funcao/${SECRET}?${new URLSearchParams(GOOD_QUERY)}`)).status, 404);
  assertEquals(s.inserts.length, 0);
});

Deno.test("path sem /functions/v1 (runtime remove o prefixo) também funciona", async () => {
  const s = build();
  assertEquals((await run(s, url(GOOD_QUERY, SECRET, "/getnet-callback/"))).status, 200);
  assertEquals(s.inserts.length, 1);
});

Deno.test("S-14: segredo certo sem query (ou só chaves desconhecidas) => 200 {ok:true} sem efeito; no-store e sem CORS", async () => {
  const s = build({ env: { GETNET_FORWARD_CREDIT_URL: "https://x.getnet.com.br/cb" } });
  for (const q of [null, "foo=1", "utm_source=x"]) {
    const res = await run(s, url(q));
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { ok: true });
    assertEquals(res.headers.get("Cache-Control"), "no-store");
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
  }
  assertEquals(s.inserts.length, 0);
  assertEquals(s.forwarded.length, 0);
  assertEquals((await run(s, url("x=1&y=2", "errado".repeat(8)))).headers.get("Cache-Control"), "no-store"); // também nos 404
});

// ---------------------------------------------------------------------------
// Validação de entrada (S-02) — 400 nunca grava, consulta nem repassa
// ---------------------------------------------------------------------------

Deno.test("S-02: parâmetros inválidos/injeção/chave repetida/ausente => 400 sem gravar nem consultar", async () => {
  const cases: [string, Record<string, string> | string][] = [
    ["order_id com OR", { ...GOOD_QUERY, order_id: "x OR name:#1030 aaaaaaaa" }],
    ["order_id com espaço", { ...GOOD_QUERY, order_id: "aaaaaaaaaa bbbbbbbbbb" }],
    ["order_id curinga", { ...GOOD_QUERY, order_id: "*" }],
    ["order_id curinga longo", { ...GOOD_QUERY, order_id: "aaaaaaaaaa*" }],
    ["order_id aspas", { ...GOOD_QUERY, order_id: 'aaaaaaaaaa"bbbb' }],
    ["order_id dois-pontos", { ...GOOD_QUERY, order_id: "payment_id:aaaaaaaaaa" }],
    ["order_id curto", { ...GOOD_QUERY, order_id: "abc" }],
    ["order_id longo", { ...GOOD_QUERY, order_id: "a".repeat(65) }],
    ["order_id começando com hífen (negação na busca)", { ...GOOD_QUERY, order_id: "-TroAR6NU.0" }],
    ["order_id com barra", { ...GOOD_QUERY, order_id: "TroA/R6NU.0" }],
    ["payment_id não UUID", { ...GOOD_QUERY, payment_id: "not-a-uuid" }],
    ["payment_id UUID com lixo", { ...GOOD_QUERY, payment_id: `${PAY}x` }],
    ["amount decimal (reais)", { ...GOOD_QUERY, amount: "169.94" }],
    ["amount zero", { ...GOOD_QUERY, amount: "0" }],
    ["amount negativo", { ...GOOD_QUERY, amount: "-5" }],
    ["amount notação científica", { ...GOOD_QUERY, amount: "1e3" }],
    ["amount grande demais", { ...GOOD_QUERY, amount: "1234567890" }],
    ["amount com zero à esquerda", { ...GOOD_QUERY, amount: "0123" }],
    ["payment_type inválido", { ...GOOD_QUERY, payment_type: "debit" }],
    ["payment_type em maiúsculas", { ...GOOD_QUERY, payment_type: "CREDIT" }],
    ["status com caractere inválido", { ...GOOD_QUERY, status: "APPROVED;DROP" }],
    ["status longo demais", { ...GOOD_QUERY, status: "A".repeat(31) }],
    ["status vazio", { ...GOOD_QUERY, status: "" }],
    ["chave repetida", `${new URLSearchParams(GOOD_QUERY)}&order_id=${ORDER_ID}`],
    ["chave repetida com valor diferente", `${new URLSearchParams(GOOD_QUERY)}&amount=1`],
    ["parâmetro ausente", (() => { const { status: _s, ...rest } = GOOD_QUERY; return rest; })()],
    ["só order_id", { order_id: ORDER_ID }],
  ];
  const s = build();
  for (const [name, q] of cases) {
    assertEquals((await run(s, url(q))).status, 400, name);
  }
  assertEquals(s.inserts.length, 0);
  assertEquals(s.calls.length, 0);
});

Deno.test("order_id no formato de 20/10 (`XXXX-XXXX.0`, `XXXX_XX.0`) é aceito: grava, 200 (antes dava 400)", async () => {
  const s = build();
  for (const [i, orderId] of ["TroA-R6NU.0", "XZ7Gpt_FO.0", ORDER_ID].entries()) {
    const res = await run(s, url({ ...GOOD_QUERY, order_id: orderId, payment_id: `${i}1111111-2222-4333-8444-555555555555` }));
    assertEquals(res.status, 200, orderId);
  }
  assertEquals(s.inserts.map((i) => i.shopify_payment_id), ["TroA-R6NU.0", "XZ7Gpt_FO.0", ORDER_ID]);
});

Deno.test("callback real de 20/10 (query completa da Getnet, dados trocados): 200, gravado e repassado intacto ao app", async () => {
  const real =
    "payment_type=credit&customer_id=00000000000&order_id=TroA-R6NU.0&payment_id=37834494-849b-4779-9f0c-bba993a97ef3&amount=47093" +
    "&status=APPROVED&number_installments=1&acquirer_transaction_id=000000000001&authorization_timestamp=2026-10-20T17%3A01%3A17.000Z" +
    "&brand=mastercard&terminal_nsu=000001&authorization_code=000000000000000001";
  const credit = "https://getnet-config-prod-x.herokuapp.com/shopify-middleware/order/webhooks/credit";
  const s = build({ env: { GETNET_FORWARD_CREDIT_URL: credit }, orders: () => [] });
  assertEquals((await run(s, url(real))).status, 200);
  assertEquals(s.inserts[0], {
    getnet_payment_id: "37834494-849b-4779-9f0c-bba993a97ef3",
    shopify_payment_id: "TroA-R6NU.0",
    payment_type: "credit",
    status_getnet: "APPROVED",
    amount_cents: 47093,
  });
  assertEquals(states(s), ["pending"]); // sem pedido na Shopify: fica para o reconcile (e depois needs_review)
  assertEquals(s.forwarded, [`${credit}?${real}`]); // todos os parâmetros, na ordem original, sem o segredo
  assertFalse(s.forwarded[0].includes(SECRET));
  assert(typeof (s.rows[0] as unknown as Record<string, unknown>).forwarded_at === "string");
});

Deno.test("S-16/S-17: 400 loga só NOMES dos parâmetros e o formato do amount, nunca valores", async () => {
  const logged: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void logged.push(a.join(" "));
  try {
    await run(build(), url({ ...GOOD_QUERY, amount: "169.94", order_id: "x OR name:#1030", status: "SEGREDO" }));
  } finally {
    console.error = orig;
  }
  const line = logged.join("\n");
  assert(line.includes("invalid=order_id,"), line);
  assert(line.includes("amount") && line.includes("amount_shape=999.99"), line);
  assertFalse(line.includes("169.94") || line.includes("name:") || line.includes("SEGREDO") || line.includes(SECRET), line);
});

// ---------------------------------------------------------------------------
// Idempotência (S-08)
// ---------------------------------------------------------------------------

Deno.test("S-08: INSERT falho != 23505 => 500, nada consultado (o repasse ao app já saiu)", async () => {
  const s = build({ failInsert: true, env: { GETNET_FORWARD_CREDIT_URL: "https://x.getnet.com.br/cb" } });
  assertEquals((await run(s, url())).status, 500);
  assertEquals(s.calls.length, 0);
  assertEquals(s.forwarded.length, 1);
});

Deno.test("duplicado igual => 200 sem nova consulta; o repasse acompanha cada entrega da Getnet", async () => {
  const s = build({ env: { GETNET_FORWARD_CREDIT_URL: "https://x.getnet.com.br/cb" } });
  assertEquals((await run(s, url())).status, 200);
  const findsAfterFirst = s.calls.length;
  assertEquals(s.forwarded.length, 1);
  assertEquals((await run(s, url())).status, 200);
  assertEquals(s.rows.length, 1);
  assertEquals(s.calls.length, findsAfterFirst);
  assertEquals(s.forwarded.length, 2); // a retentativa da Getnet também chega ao app, como chegaria sem a ponte
  assertEquals(mutations(s), 2); // 1x mark + 1x tag (do 1º callback)
});

Deno.test("dedupe normaliza: status em minúsculas e payment_id em maiúsculas não furam a chave", async () => {
  const s = build();
  await run(s, url({ ...GOOD_QUERY, status: "approved" }));
  await run(s, url({ ...GOOD_QUERY, payment_id: PAY.toUpperCase(), status: "Approved" }));
  assertEquals(s.rows.length, 1);
  assertEquals(s.rows[0].status_getnet, "APPROVED");
  assertEquals(s.rows[0].getnet_payment_id, PAY);
  assertEquals(s.calls.filter((c) => c.startsWith("mark:")).length, 1);
});

Deno.test("23505 com order_id/amount diferentes => needs_review callback_conflict (200), sem mutar", async () => {
  const s = build({ env: { GETNET_CALLBACK_LIVE: null } }); // 1º fica pending (dry-run)
  await run(s, url());
  assertEquals(states(s), ["pending"]);
  const res = await run(s, url({ ...GOOD_QUERY, amount: "100" }));
  assertEquals(res.status, 200);
  assertEquals(s.rows[0].state, "needs_review");
  assertEquals(s.patches.at(-1)?.patch.error, "callback_conflict");
  assertEquals(mutations(s), 0);
  // order_id diferente também é conflito
  const t = build({ env: { GETNET_CALLBACK_LIVE: null } });
  await run(t, url());
  await run(t, url({ ...GOOD_QUERY, order_id: "ZZZZZZZZZZZZZZZZZZZZZZZZZ" }));
  assertEquals(t.rows[0].state, "needs_review");
});

Deno.test("conflito em linha já `done` NÃO rebaixa (estorno depende dela)", async () => {
  const s = build();
  await run(s, url());
  assertEquals(states(s), ["done"]);
  await run(s, url({ ...GOOD_QUERY, amount: "100" }));
  assertEquals(states(s), ["done"]);
  // e o estorno posterior continua detectado
  await run(s, url({ ...GOOD_QUERY, status: "CANCELED" }));
  assertEquals(s.rows.find((r) => r.status_getnet === "CANCELED")?.state, "needs_review");
});

// ---------------------------------------------------------------------------
// Cartão (S-02.3, S-03)
// ---------------------------------------------------------------------------

Deno.test("cartão casado => busca por order_id, orderMarkAsPaid 1x, tag getnet-auto-pago, state done", async () => {
  const s = build();
  const res = await run(s, url());
  assertEquals(res.status, 200);
  assertEquals(s.rows[0].state, "done");
  assertEquals(s.calls.filter((c) => c.startsWith("mark:")), ["mark:gid://shopify/Order/1026"]);
  assertEquals(s.calls.filter((c) => c.startsWith("tag:")), ["tag:gid://shopify/Order/1026:getnet-auto-pago"]);
  assertEquals(s.calls[0], `find:${ORDER_ID}`);
  const last = s.patches.at(-1)?.patch;
  assertEquals(last?.shopify_order_id, "gid://shopify/Order/1026");
  assertEquals(last?.shopify_order_name, "#1026");
});

Deno.test("falha ao taguear não desfaz: continua done", async () => {
  const s = build({ addTag: () => Promise.reject(new Error("shopify_admin_http_500")) });
  assertEquals((await run(s, url())).status, 200);
  assertEquals(states(s), ["done"]);
});

Deno.test("casamento inexato / limites => needs_review SEM mutar (um caso por motivo)", async () => {
  const cases: [string, string, Opts][] = [
    ["payment_id_mismatch", "paymentId não exato", { orders: () => [order({ transactions: [{ paymentId: `${ORDER_ID}X`, kind: "SALE", status: "PENDING", gateway: "Getnet" }] })] }],
    ["payment_id_mismatch", "sem transação", { orders: () => [order({ transactions: [] })] }],
    ["gateway_mismatch", "gateway não Getnet", { orders: () => [order({ transactions: [{ paymentId: ORDER_ID, kind: "SALE", status: "PENDING", gateway: "manual" }] })] }],
    ["kind_mismatch", "kind != SALE", { orders: () => [order({ transactions: [{ paymentId: ORDER_ID, kind: "AUTHORIZATION", status: "PENDING", gateway: "Getnet" }] })] }],
    ["order_cancelled", "cancelado", { orders: () => [order({ cancelledAt: "2026-10-13T14:59:00Z" })] }],
    ["amount_mismatch", "valor divergente", { orders: () => [order({ totalOutstandingCents: 16995 })] }],
    ["amount_mismatch", "total em aberto NaN", { orders: () => [order({ totalOutstandingCents: Number.NaN })] }],
    ["order_ambiguous", "2 pedidos", { orders: () => [order(), order({ id: "gid://shopify/Order/2" })] }],
    ["currency_mismatch", "moeda != BRL", { orders: () => [order({ currencyCode: "USD" })] }],
    ["status_not_payable", "REFUNDED", { orders: () => [order({ displayFinancialStatus: "REFUNDED" })] }],
    ["status_not_payable", "PARTIALLY_PAID", { orders: () => [order({ displayFinancialStatus: "PARTIALLY_PAID" })] }],
    ["cannot_mark_paid", "canMarkAsPaid false", { orders: () => [order({ canMarkAsPaid: false })] }],
    ["above_cap", "acima do teto (60000)", { orders: () => [order({ totalOutstandingCents: 60001 })] }],
    ["outside_recency", "pedido de 31 min", { orders: () => [order({ createdAt: new Date(NOW.getTime() - 31 * 60_000).toISOString() })] }],
    ["outside_recency", "createdAt ilegível", { orders: () => [order({ createdAt: "lixo" })] }],
    ["breaker_open", "10 auto-pagos na hora", { paidSince: 10 }],
  ];
  for (const [code, name, opts] of cases) {
    const s = build(opts);
    // amount do callback acompanha o total quando o caso testa só o teto
    const amount = code === "above_cap" ? "60001" : "16994";
    assertEquals((await run(s, url({ ...GOOD_QUERY, amount }))).status, 200, name);
    assertEquals(s.rows[0].state, "needs_review", name);
    assertEquals(s.rows[0].state === "needs_review" && s.patches.at(-1)?.patch.error, code, name);
    assertEquals(mutations(s), 0, name);
  }
});

Deno.test("needs_review por gate com pedido achado grava shopify_order_id/name (alerta do 04); sem pedido, não", async () => {
  const idName = (s: Spy) => ({ id: s.patches.at(-1)?.patch.shopify_order_id, name: s.patches.at(-1)?.patch.shopify_order_name });
  const withOrder = { id: "gid://shopify/Order/1026", name: "#1026" };
  const cases: [string, Opts, boolean][] = [
    ["above_cap", { orders: () => [order({ totalOutstandingCents: 60001 })] }, true],
    ["outside_recency", { orders: () => [order({ createdAt: new Date(NOW.getTime() - 33 * 3_600_000).toISOString() })] }, true],
    ["breaker_open", { paidSince: 10 }, true],
    ["order_changed", { orders: (n) => (n === 1 ? [order()] : []) }, true],
    ["mark_paid_failed", { markAsPaid: async () => ({ ok: false }) }, true],
    ["payment_id_mismatch", { orders: () => [order({ transactions: [] })] }, false], // casamento não provado: não grava pedido
    ["order_ambiguous", { orders: () => [order(), order({ id: "gid://shopify/Order/2" })] }, false],
  ];
  for (const [code, opts, recorded] of cases) {
    const s = build(opts);
    await run(s, url({ ...GOOD_QUERY, amount: code === "above_cap" ? "60001" : "16994" }));
    assertEquals(s.rows[0].state, "needs_review", code);
    assertEquals(s.patches.at(-1)?.patch.error, code, code);
    assertEquals(idName(s), recorded ? withOrder : { id: undefined, name: undefined }, code);
  }
});

Deno.test("limites de borda: exatamente no teto, na recência e 9 auto-pagos ainda pagam", async () => {
  const s = build({ orders: () => [order({ totalOutstandingCents: 60000, createdAt: new Date(NOW.getTime() - 30 * 60_000).toISOString() })], paidSince: 9 });
  await run(s, url({ ...GOOD_QUERY, amount: "60000" }));
  assertEquals(states(s), ["done"]);
});

Deno.test("limites vêm do env (sobrescrevem o default); env inválido volta ao default", async () => {
  const cap = build({ env: { GETNET_AUTOPAY_MAX_CENTS: "10000" } });
  await run(cap, url());
  assertEquals(cap.rows[0].state, "needs_review");
  assertEquals(mutations(cap), 0);
  const rec = build({ env: { GETNET_AUTOPAY_RECENCY_MIN: "0" } }); // inválido => 30
  await run(rec, url());
  assertEquals(rec.rows[0].state, "done");
  const hr = build({ env: { GETNET_AUTOPAY_MAX_PER_HOUR: "2" }, paidSince: 2 });
  await run(hr, url());
  assertEquals(hr.rows[0].state, "needs_review");
  const garbage = build({ env: { GETNET_AUTOPAY_MAX_CENTS: "abc", GETNET_AUTOPAY_MAX_PER_HOUR: "-1" }, paidSince: 10 });
  await run(garbage, url());
  assertEquals(garbage.rows[0].state, "needs_review"); // default 10 vale
});

Deno.test("pedido não encontrado => pending (attempts 1), sem mutar", async () => {
  const s = build({ orders: () => [] });
  assertEquals((await run(s, url())).status, 200);
  assertEquals(s.rows[0].state, "pending");
  assertEquals(s.rows[0].attempts, 1);
  assertEquals(mutations(s), 0);
});

Deno.test("já pago => done sem mutar", async () => {
  const s = build({ orders: () => [order({ displayFinancialStatus: "PAID", canMarkAsPaid: false, totalOutstandingCents: 0 })] });
  await run(s, url());
  assertEquals(s.rows[0].state, "done");
  assertEquals(mutations(s), 0);
});

Deno.test("reconsulta antes de mutar: pago entre as duas leituras => done sem mutar", async () => {
  const s = build({ orders: (n) => [n === 1 ? order() : order({ displayFinancialStatus: "PAID", canMarkAsPaid: false, totalOutstandingCents: 0 })] });
  await run(s, url());
  assertEquals(s.rows[0].state, "done");
  assertEquals(s.calls.filter((c) => c.startsWith("find:")).length, 2);
  assertEquals(mutations(s), 0);
});

Deno.test("reconsulta antes de mutar: pedido mudou (cancelado) => needs_review sem mutar", async () => {
  const s = build({ orders: (n) => [n === 1 ? order() : order({ cancelledAt: "2026-10-13T15:00:00Z" })] });
  await run(s, url());
  assertEquals(s.rows[0].state, "needs_review");
  assertEquals(mutations(s), 0);
});

Deno.test("userError do orderMarkAsPaid: reconsulta; pago => done; senão needs_review mark_paid_failed", async () => {
  const paid = order({ displayFinancialStatus: "PAID", canMarkAsPaid: false, totalOutstandingCents: 0 });
  const a = build({ markAsPaid: async () => ({ ok: false }), orders: (n) => [n >= 3 ? paid : order()] });
  await run(a, url());
  assertEquals(a.rows[0].state, "done");
  assertEquals(a.calls.filter((c) => c.startsWith("tag:")).length, 0);
  const b = build({ markAsPaid: async () => ({ ok: false }) });
  await run(b, url());
  assertEquals(b.rows[0].state, "needs_review");
  assertEquals(b.patches.at(-1)?.patch.error, "mark_paid_failed");
});

Deno.test("falha transitória da Shopify => 200, pending com código curto e attempts+1, nada mutado", async () => {
  // Ticket 02 (S-07d): 429/5xx/THROTTLED NÃO gastam tentativa (teste próprio abaixo); os demais erros transitórios gastam.
  const s = build({ findThrows: "shopify_admin_bad_response" });
  assertEquals((await run(s, url())).status, 200);
  assertEquals(s.rows[0].state, "pending");
  assertEquals(s.rows[0].attempts, 1);
  assertEquals(s.patches.at(-1)?.patch.error, "shopify_admin_bad_response");
  assertEquals(mutations(s), 0);
});

Deno.test("S-03.4: sem LIVE (ausente/false) => dry-run: nada é mutado, mas os gates rodam", async () => {
  for (const live of [null, "", "false", "TRUE", "1"]) {
    const s = build({ env: { GETNET_CALLBACK_LIVE: live } });
    assertEquals((await run(s, url())).status, 200);
    assertEquals(s.rows[0].state, "pending", `live=${live}`);
    assertEquals(s.patches.at(-1)?.patch.error, "dry_run");
    assertEquals(mutations(s), 0);
    assertEquals(s.calls.filter((c) => c.startsWith("find:")).length, 1); // sem reconsulta: nunca chegou a mutar
  }
  // o gate de recência reprova em dry-run igual a produção (caso do replay do #1026)
  const old = build({ env: { GETNET_CALLBACK_LIVE: null }, orders: () => [order({ createdAt: new Date(NOW.getTime() - 33 * 3_600_000).toISOString() })] });
  await run(old, url());
  assertEquals(old.rows[0].state, "needs_review");
  assertEquals(old.patches.at(-1)?.patch.error, "outside_recency");
});

// ---------------------------------------------------------------------------
// Pix / status != APPROVED
// ---------------------------------------------------------------------------

Deno.test("Pix aprovado => pending, nunca consulta nem muta a Shopify", async () => {
  const s = build();
  assertEquals((await run(s, url({ ...GOOD_QUERY, payment_type: "pix" }))).status, 200);
  assertEquals(s.rows[0].state, "pending");
  assertEquals(s.rows[0].payment_type, "pix");
  assertEquals(s.calls.length, 0);
});

Deno.test("status != APPROVED => ignored (cartão e Pix), sem consultar a Shopify", async () => {
  for (const status of ["DENIED", "CANCELED", "PENDING"]) {
    const s = build();
    await run(s, url({ ...GOOD_QUERY, status }));
    assertEquals(s.rows[0].state, "ignored", status);
    assertEquals(s.calls.length, 0);
  }
  const pix = build();
  await run(pix, url({ ...GOOD_QUERY, payment_type: "pix", status: "CANCELED" }));
  assertEquals(pix.rows[0].state, "ignored");
});

Deno.test("S-03.5: status != APPROVED DEPOIS de auto-pago => needs_review (refund_after_paid), não ignored", async () => {
  const s = build();
  await run(s, url());
  assertEquals(states(s), ["done"]);
  await run(s, url({ ...GOOD_QUERY, status: "REFUNDED" }));
  assertEquals(states(s), ["done", "needs_review"]);
  assertEquals(s.patches.at(-1)?.patch.error, "refund_after_paid");
  assertEquals(mutations(s), 2); // só as do pagamento original
});

// ---------------------------------------------------------------------------
// Repasse (S-13)
// ---------------------------------------------------------------------------

Deno.test("repasse: query original (inclusive parâmetros extras da Getnet), sem segredo, por tipo; grava forwarded_at", async () => {
  const s = build({
    env: { GETNET_FORWARD_CREDIT_URL: "https://jilo.herokuapp.com/getnet/credit?token=abc", GETNET_FORWARD_PIX_URL: "https://pix.getnet.com.br/cb" },
  });
  await run(s, url({ ...GOOD_QUERY, extra: "1" }));
  assertEquals(s.forwarded.length, 1);
  const u = new URL(s.forwarded[0]);
  assertEquals(u.origin + u.pathname, "https://jilo.herokuapp.com/getnet/credit");
  assertEquals(u.searchParams.get("token"), "abc"); // query já presente na base da Getnet sobrevive
  assertEquals(
    [...u.searchParams.keys()].sort(),
    ["amount", "extra", "order_id", "payment_id", "payment_type", "status", "token"],
  ); // a query da Getnet volta para a Getnet inteira (o app pode precisar de authorization_code etc.)
  assertEquals(u.searchParams.get("order_id"), ORDER_ID);
  assertEquals(u.searchParams.get("payment_id"), PAY);
  assertFalse(s.forwarded[0].includes(SECRET));
  assert(s.rows[0].state === "done" && typeof (s.rows[0] as unknown as Record<string, unknown>).forwarded_at === "string");

  await run(s, url({ ...GOOD_QUERY, payment_id: "99999999-2222-4333-8444-555555555555", payment_type: "pix" }));
  assertEquals(s.forwarded.length, 2);
  assertEquals(new URL(s.forwarded[1]).host, "pix.getnet.com.br");
});

Deno.test("repasse: valores originais (case) preservados; falha/timeout não afeta a resposta nem o estado", async () => {
  const s = build({ env: { GETNET_FORWARD_CREDIT_URL: "https://x.getnet.com.br/cb" }, forward: () => Promise.reject(new Error("timeout")) });
  const res = await run(s, url({ ...GOOD_QUERY, payment_id: PAY.toUpperCase(), status: "approved" }));
  assertEquals(res.status, 200);
  assertEquals(states(s), ["done"]);
  const u = new URL(s.forwarded[0]);
  assertEquals(u.searchParams.get("payment_id"), PAY.toUpperCase());
  assertEquals(u.searchParams.get("status"), "approved");
  assertEquals((s.rows[0] as unknown as Record<string, unknown>).forwarded_at, undefined); // não entregou
});

Deno.test("repasse: destino inválido (http, host alheio, credenciais, lixo) ou vazio => não repassa, resposta normal", async () => {
  for (const bad of ["http://x.getnet.com.br/cb", "https://evil.example.com/cb", "https://u:p@x.getnet.com.br/cb", "https://getnet.com.br.evil.com/cb", "nao-e-url", ""]) {
    const s = build({ env: { GETNET_FORWARD_CREDIT_URL: bad } });
    assertEquals((await run(s, url())).status, 200, bad);
    assertEquals(s.forwarded.length, 0, bad);
    assertEquals(states(s), ["done"], bad);
  }
});

Deno.test("repasse: nenhum em 404 (segredo errado), sem query ou payment_type desconhecido", async () => {
  const env = { GETNET_FORWARD_CREDIT_URL: "https://x.getnet.com.br/cb", GETNET_FORWARD_PIX_URL: "https://x.getnet.com.br/pix" };
  const s = build({ env });
  await run(s, url(GOOD_QUERY, "x".repeat(34)));
  await run(s, url(null));
  await run(s, url({ ...GOOD_QUERY, payment_type: "debit" }));
  assertEquals(s.forwarded.length, 0);
});

Deno.test("repasse ANTES de validar: 400 nosso ainda entrega a query original ao app, sem gravar forwarded_at", async () => {
  const s = build({ env: { GETNET_FORWARD_CREDIT_URL: "https://x.getnet.com.br/cb", GETNET_FORWARD_PIX_URL: "https://x.getnet.com.br/pix" } });
  assertEquals((await run(s, url({ ...GOOD_QUERY, amount: "1.5" }))).status, 400);
  assertEquals((await run(s, url({ ...GOOD_QUERY, payment_type: "pix", order_id: "x y" }))).status, 400);
  assertEquals(s.forwarded.map((u) => new URL(u).pathname), ["/cb", "/pix"]);
  assertEquals(new URL(s.forwarded[0]).searchParams.get("amount"), "1.5");
  assertEquals(s.inserts.length, 0);
});

// ===========================================================================
// Ticket 02 — reconcile (POST /reconcile), claim por lease, expiração, S-07 (teto de fila / orçamento inline), heartbeat
// ===========================================================================

const MIN = 60_000;
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const BEARER = { Authorization: `Bearer ${RSECRET}` };

let seq = 0;
/** Linha já existente na tabela (cartão `pending` por padrão, achada pelo `ORDER_ID` do stub de `order()`). */
function seed(s: Spy, over: Partial<CallbackRow> = {}): CallbackRow {
  const n = String(++seq).padStart(4, "0");
  const row: CallbackRow = {
    id: `seed-${n}`,
    getnet_payment_id: `aaaaaaaa-0000-4000-8000-00000000${n}`,
    shopify_payment_id: ORDER_ID,
    payment_type: "credit",
    status_getnet: "APPROVED",
    amount_cents: 16994,
    state: "pending",
    attempts: 1,
    error: "order_not_found",
    received_at: NOW.toISOString(),
    locked_until: null,
    ...over,
  };
  s.rows.push(row);
  return row;
}

const reconcileReq = (headers: Record<string, string> = BEARER, method = "POST", path = "/functions/v1/getnet-callback/reconcile") =>
  new Request(`http://localhost${path}`, { method, headers });
const reconcile = (s: Spy) => handleGetnetCallback(reconcileReq(), s.deps);

type Summary = Record<"checked" | "done" | "pending" | "needs_review" | "ignored" | "expired" | "skipped" | "errors", number>;
const summary = async (res: Response): Promise<Summary> => {
  const { ok: _ok, ...counters } = await res.json(); // `ok` é o único campo não-contador
  return counters as Summary;
};
/** Pedido criado 10 s antes de o callback chegar (`receivedAgoMs` = há quanto tempo o callback chegou). */
const orderFor = (receivedAgoMs: number, over: Partial<ShopifyOrderLite> = {}) => order({ createdAt: ago(receivedAgoMs + 10_000), ...over });

// ---------------------------------------------------------------------------
// Auth da rota (S-01, S-04.2): 404 uniforme, antes de tocar a fila
// ---------------------------------------------------------------------------

Deno.test("reconcile: Bearer ausente/errado/curto/de outro segredo => 404 sem listar, processar nem gravar heartbeat", async () => {
  const s = build();
  seed(s);
  const bad: Record<string, string>[] = [
    {},
    { Authorization: "" },
    { Authorization: "Bearer " },
    { Authorization: "Bearer curto" },
    { Authorization: `Bearer ${"x".repeat(34)}` },
    { Authorization: `Bearer ${RSECRET.slice(0, -1)}` },
    { Authorization: `Bearer ${RSECRET}x` },
    { Authorization: RSECRET }, // sem o prefixo Bearer
    { Authorization: `Basic ${RSECRET}` },
    { Authorization: `Bearer ${SECRET}` }, // o segredo do path (o que a Getnet conhece) NÃO aciona o reconcile
    { Authorization: `Bearer ${PREV}` },
  ];
  for (const h of bad) assertEquals((await handleGetnetCallback(reconcileReq(h), s.deps)).status, 404, JSON.stringify(h));
  assertEquals(s.lists.length, 0);
  assertEquals(s.claims.length, 0);
  assertEquals(s.heartbeats.length, 0);
  assertEquals(s.calls.length, 0);
  assertEquals(s.rows[0].state, "pending");
  // mesmo corpo 404 de qualquer outra negativa
  const other = await run(build({ env: { GETNET_CALLBACK_ENABLED: null } }), url());
  assertEquals(await (await handleGetnetCallback(reconcileReq({}), s.deps)).text(), await other.text());
});

Deno.test("reconcile: GETNET_RECONCILE_SECRET ausente/vazio/curto/fora do charset => 404 mesmo com Bearer 'igual' (S-01)", async () => {
  for (const cfg of [null, "", "curto", "a".repeat(31), `${"a".repeat(31)}+`, `${"a".repeat(31)}%`, `${"a".repeat(31)} `]) {
    const s = build({ env: { GETNET_RECONCILE_SECRET: cfg } });
    seed(s);
    assertEquals((await handleGetnetCallback(reconcileReq({ Authorization: `Bearer ${cfg ?? ""}` }), s.deps)).status, 404, `cfg=${cfg}`);
    assertEquals((await handleGetnetCallback(reconcileReq({ Authorization: "Bearer " }), s.deps)).status, 404, `cfg=${cfg} vazio`);
    assertEquals(s.lists.length, 0);
    assertEquals(s.heartbeats.length, 0);
  }
});

Deno.test("reconcile: só POST (GET/PUT/DELETE/HEAD/PATCH => 404), path exato e kill-switch (ausente ou != true => 404)", async () => {
  const s = build();
  seed(s);
  for (const method of ["GET", "PUT", "DELETE", "HEAD", "PATCH"]) {
    assertEquals((await handleGetnetCallback(reconcileReq(BEARER, method), s.deps)).status, 404, method);
  }
  // GET no /reconcile com query de callback não grava nada
  assertEquals((await run(s, url(GOOD_QUERY, "reconcile"))).status, 404);
  for (const path of ["/functions/v1/getnet-callback/reconcile/", "/functions/v1/getnet-callback/reconcile/extra", "/functions/v1/getnet-callback", "/functions/v1/getnet-callback/Reconcile", "/functions/v1/outra/reconcile"]) {
    assertEquals((await handleGetnetCallback(reconcileReq(BEARER, "POST", path), s.deps)).status, 404, path);
  }
  for (const enabled of [null, "false", "TRUE", ""]) {
    const off = build({ env: { GETNET_CALLBACK_ENABLED: enabled } });
    seed(off);
    assertEquals((await handleGetnetCallback(reconcileReq(), off.deps)).status, 404, `enabled=${enabled}`);
    assertEquals(off.lists.length, 0);
    assertEquals(off.heartbeats.length, 0);
  }
  assertEquals(s.inserts.length, 0);
  assertEquals(s.lists.length, 0);
  assertEquals(s.heartbeats.length, 0);
  // sem /functions/v1 (o runtime remove o prefixo) também roteia
  assertEquals((await handleGetnetCallback(reconcileReq(BEARER, "POST", "/getnet-callback/reconcile"), s.deps)).status, 200);
});

// ---------------------------------------------------------------------------
// Cartão: reprocessa, recência por received_at, expiração
// ---------------------------------------------------------------------------

Deno.test("reconcile: cartão pending => done quando o pedido aparece (recência por received_at, não por now), lease liberado, sem repasse", async () => {
  const received = 45 * MIN; // com now() como referência o pedido (45 min) cairia fora dos 30 min
  const s = build({ orders: () => [orderFor(received)], env: { GETNET_FORWARD_CREDIT_URL: "https://x.getnet.com.br/cb" } });
  seed(s, { attempts: 2, received_at: ago(received) });
  const res = await reconcile(s);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Cache-Control"), "no-store");
  assertEquals(await summary(res), { checked: 1, done: 1, pending: 0, needs_review: 0, ignored: 0, expired: 0, skipped: 0, errors: 0 });
  assertEquals(s.rows[0].state, "done");
  assertEquals(s.rows[0].locked_until, null);
  assertEquals(s.calls[0], `find:${ORDER_ID}`);
  assertEquals(s.calls.filter((c) => c.startsWith("mark:")), ["mark:gid://shopify/Order/1026"]);
  assertEquals(s.calls.filter((c) => c.startsWith("tag:")), ["tag:gid://shopify/Order/1026:getnet-auto-pago"]);
  assertEquals(s.forwarded.length, 0); // repasse é só da 1ª gravação (S-13)
  assertEquals(s.patches.at(-1)?.patch.shopify_order_name, "#1026");
});

Deno.test("reconcile: os gates do 01 valem no reprocessamento (pedido criado 31 min antes do callback => outside_recency; teto; breaker)", async () => {
  const cases: [string, Opts, Partial<CallbackRow>][] = [
    ["outside_recency", { orders: () => [orderFor(10 * MIN + 31 * MIN)] }, { received_at: ago(10 * MIN) }],
    ["above_cap", { orders: () => [orderFor(10 * MIN, { totalOutstandingCents: 60001 })] }, { received_at: ago(10 * MIN), amount_cents: 60001 }],
    ["breaker_open", { paidSince: 10 }, { received_at: ago(10 * MIN) }],
    ["amount_mismatch", { orders: () => [orderFor(10 * MIN, { totalOutstandingCents: 1 })] }, { received_at: ago(10 * MIN) }],
  ];
  for (const [code, opts, over] of cases) {
    const s = build(opts);
    seed(s, over);
    await reconcile(s);
    assertEquals(s.rows[0].state, "needs_review", code);
    assertEquals(s.rows[0].error, code);
    assertEquals(mutations(s), 0, code);
  }
});

Deno.test("reconcile: pedido ainda não achado => continua pending, attempts+1, lease liberado", async () => {
  const s = build({ orders: () => [] });
  seed(s, { attempts: 2, received_at: ago(10 * MIN), locked_until: ago(MIN) }); // lease antigo (vencido) não bloqueia
  const sum = await summary(await reconcile(s));
  assertEquals(sum.pending, 1);
  assertEquals(s.rows[0].state, "pending");
  assertEquals(s.rows[0].attempts, 3);
  assertEquals(s.rows[0].locked_until, null);
  assertEquals(mutations(s), 0);
});

Deno.test("reconcile: cartão pending há > 2 h => needs_review credit_order_not_found sem consultar a Shopify; no limite (= 2 h) ainda tenta", async () => {
  const s = build();
  seed(s, { received_at: ago(2 * HOUR + 1000) });
  const sum = await summary(await reconcile(s));
  assertEquals(sum.expired, 1);
  assertEquals(sum.needs_review, 1);
  assertEquals(s.rows[0].state, "needs_review");
  assertEquals(s.rows[0].error, "credit_order_not_found");
  assertEquals(s.rows[0].locked_until, null);
  assertEquals(s.calls.length, 0);
  assertEquals(mutations(s), 0);

  const edge = build({ orders: () => [] });
  seed(edge, { received_at: ago(2 * HOUR) });
  assertEquals((await summary(await reconcile(edge))).expired, 0);
  assertEquals(edge.rows[0].state, "pending");
  assertEquals(edge.calls.length, 1);
});

Deno.test("reconcile: linha `received` (gravada sem processar) é processada mesmo com > 2 h; só `pending` expira", async () => {
  const s = build({ orders: () => [orderFor(3 * HOUR)] });
  seed(s, { state: "received", attempts: 0, error: null, received_at: ago(3 * HOUR) });
  const sum = await summary(await reconcile(s));
  assertEquals(sum.expired, 0);
  assertEquals(sum.done, 1);
  assertEquals(s.rows[0].state, "done");
});

Deno.test("reconcile: Pix pending há > 24 h => needs_review pix_expired; dentro do prazo fica pending (attempts+1) sem tocar a Shopify; Pix received vira pending", async () => {
  const s = build();
  const expired = seed(s, { payment_type: "pix", error: "pix_pending", received_at: ago(24 * HOUR + 1000) });
  const edge = seed(s, { payment_type: "pix", error: "pix_pending", received_at: ago(24 * HOUR) });
  const live = seed(s, { payment_type: "pix", error: "pix_pending", received_at: ago(23 * HOUR) });
  const fresh = seed(s, { payment_type: "pix", state: "received", attempts: 0, error: null, received_at: ago(MIN) });
  const sum = await summary(await reconcile(s));
  assertEquals(sum, { checked: 4, done: 0, pending: 3, needs_review: 1, ignored: 0, expired: 1, skipped: 0, errors: 0 });
  assertEquals([expired.state, expired.error], ["needs_review", "pix_expired"]);
  assertEquals([edge.state, edge.attempts], ["pending", 2]);
  assertEquals([live.state, live.attempts], ["pending", 2]);
  assertEquals([fresh.state, fresh.attempts], ["pending", 1]);
  assertEquals(s.calls.length, 0); // Pix: nenhuma consulta nem mutação na Shopify neste ticket
  assertEquals(s.rows.every((r) => r.locked_until === null), true);
});

Deno.test("reconcile: status != APPROVED que ficou `received` segue a regra do 01 (ignored; estorno após auto-pago => needs_review)", async () => {
  const s = build();
  seed(s, { state: "done", getnet_payment_id: PAY, received_at: ago(HOUR) });
  const refund = seed(s, { state: "received", attempts: 0, error: null, getnet_payment_id: PAY, status_getnet: "REFUNDED" });
  const denied = seed(s, { state: "received", attempts: 0, error: null, status_getnet: "DENIED", received_at: ago(MIN) });
  const sum = await summary(await reconcile(s));
  assertEquals([sum.needs_review, sum.ignored], [1, 1]);
  assertEquals([refund.state, refund.error], ["needs_review", "refund_after_paid"]);
  assertEquals(denied.state, "ignored");
  assertEquals(s.calls.length, 0);
});

// ---------------------------------------------------------------------------
// dry_run (handoff do 01)
// ---------------------------------------------------------------------------

Deno.test("reconcile: pending dry_run é reavaliada — sem LIVE continua dry_run; com LIVE paga (recência por received_at, fora da expiração de 2 h)", async () => {
  const received = 5 * HOUR; // muito além dos 2 h do cartão
  const base: Partial<CallbackRow> = { error: "dry_run", received_at: ago(received) };

  const off = build({ env: { GETNET_CALLBACK_LIVE: null }, orders: () => [orderFor(received)] });
  seed(off, base);
  await reconcile(off);
  assertEquals([off.rows[0].state, off.rows[0].error], ["pending", "dry_run"]);
  assertEquals(mutations(off), 0);

  const on = build({ orders: () => [orderFor(received)] });
  seed(on, base);
  assertEquals((await summary(await reconcile(on))).done, 1);
  assertEquals(on.rows[0].state, "done");
  assertEquals(mutations(on), 2);

  const late = build({ orders: () => [orderFor(received + 31 * MIN)] }); // pedido criado 31 min antes do callback
  seed(late, base);
  await reconcile(late);
  assertEquals([late.rows[0].state, late.rows[0].error], ["needs_review", "outside_recency"]);
  assertEquals(mutations(late), 0);
});

// ---------------------------------------------------------------------------
// S-07d: throttle não gasta tentativa
// ---------------------------------------------------------------------------

Deno.test("S-07d: 429 / 5xx / THROTTLED voltam a pending SEM incrementar attempts; os outros erros incrementam", async () => {
  for (const [code, expected] of [
    ["shopify_admin_http_429", 2],
    ["shopify_admin_http_500", 2],
    ["shopify_admin_http_503", 2],
    ["shopify_admin_graphql_errors", 2], // é onde o THROTTLED do GraphQL (HTTP 200) chega via _shared
    ["shopify_admin_http_401", 3],
    ["shopify_admin_bad_response", 3],
    ["Boom!", 3],
  ] as [string, number][]) {
    const s = build({ findThrows: code });
    seed(s, { attempts: 2, received_at: ago(10 * MIN) });
    const sum = await summary(await reconcile(s));
    assertEquals(sum.pending, 1, code);
    assertEquals(s.rows[0].state, "pending", code);
    assertEquals(s.rows[0].attempts, expected, code);
    assertEquals(s.rows[0].error, code === "Boom!" ? "unexpected_error" : code, code);
    assertEquals(s.rows[0].locked_until, null, code);
    assertEquals(mutations(s), 0, code);
  }
});

Deno.test("S-07d: também no callback inline — 429 deixa a linha pending com attempts 0", async () => {
  const s = build({ findThrows: true });
  assertEquals((await run(s, url())).status, 200);
  assertEquals([s.rows[0].state, s.rows[0].attempts, s.rows[0].error], ["pending", 0, "shopify_admin_http_429"]);
});

// ---------------------------------------------------------------------------
// S-07a: ordem e lote
// ---------------------------------------------------------------------------

Deno.test("S-07a: processa em attempts asc, received_at asc", async () => {
  const s = build({ orders: () => [] });
  const mk = (id: string, attempts: number, receivedAgo: number) => seed(s, { shopify_payment_id: id, attempts, received_at: ago(receivedAgo) });
  mk("ORDERAAAAAA", 1, 10 * MIN);
  mk("ORDERBBBBBB", 0, 5 * MIN);
  mk("ORDERCCCCCC", 0, 20 * MIN);
  mk("ORDERDDDDDD", 2, 30 * MIN);
  await reconcile(s);
  assertEquals(s.calls, ["find:ORDERCCCCCC", "find:ORDERBBBBBB", "find:ORDERAAAAAA", "find:ORDERDDDDDD"]);
});

Deno.test("S-07e: no máximo 20 linhas por chamada; o resto fica intocado para a próxima", async () => {
  const s = build({ orders: () => [] });
  for (let i = 0; i < 25; i++) seed(s, { attempts: 0, received_at: ago((60 - i) * MIN) });
  const sum = await summary(await reconcile(s));
  assertEquals(s.lists, [20]);
  assertEquals(sum.checked, 20);
  assertEquals(s.calls.length, 20);
  assertEquals(s.rows.filter((r) => r.attempts === 1).length, 20);
  assertEquals(s.rows.filter((r) => r.attempts === 0).length, 5);
  // as 20 mais antigas foram as processadas
  assertEquals(s.rows.slice(0, 20).every((r) => r.attempts === 1), true);
});

// ---------------------------------------------------------------------------
// S-09: claim por lease
// ---------------------------------------------------------------------------

Deno.test("S-09: duas execuções concorrentes sobre a mesma linha => 1 mutação (a perdedora conta `skipped`)", async () => {
  const s = build({ listBarrier: 2 }); // as duas listam a linha ANTES de qualquer claim
  seed(s, { received_at: ago(MIN) });
  const [a, b] = await Promise.all([reconcile(s), reconcile(s)]);
  const [sa, sb] = [await summary(a), await summary(b)];
  assertEquals(s.claims.length, 2); // as duas tentaram
  assertEquals(sa.done + sb.done, 1);
  assertEquals(sa.skipped + sb.skipped, 1);
  assertEquals(s.calls.filter((c) => c.startsWith("mark:")).length, 1);
  assertEquals(s.calls.filter((c) => c.startsWith("tag:")).length, 1);
  assertEquals(states(s), ["done"]);
});

Deno.test("S-09: lease vigente => skipped sem consultar a Shopify; lease vencido => processa", async () => {
  const held = build();
  seed(held, { received_at: ago(MIN), locked_until: ago(-MIN) }); // vence daqui a 1 min
  const sum = await summary(await reconcile(held));
  assertEquals([sum.checked, sum.skipped, sum.done], [1, 1, 0]);
  assertEquals(held.calls.length, 0);
  assertEquals(held.rows[0].state, "pending");

  const expired = build();
  seed(expired, { received_at: ago(MIN), locked_until: ago(MIN) });
  assertEquals((await summary(await reconcile(expired))).done, 1);
});

Deno.test("S-09: o claim leva o lease de 2 min a partir de agora", async () => {
  const leases: string[] = [];
  const s = build({ orders: () => [] });
  const claim = s.deps.db.claim;
  s.deps.db.claim = async (id, leaseUntilIso, nowIso) => {
    leases.push(leaseUntilIso);
    return await claim(id, leaseUntilIso, nowIso);
  };
  seed(s, { received_at: ago(MIN) });
  await reconcile(s);
  assertEquals(leases, [new Date(NOW.getTime() + 2 * MIN).toISOString()]);
});

Deno.test("falha no claim de uma linha não derruba a varredura: conta `errors` e segue para a próxima", async () => {
  const s = build();
  const broken = seed(s, { received_at: ago(20 * MIN) });
  const ok2 = seed(s, { received_at: ago(MIN) });
  const orig = s.deps.db.claim;
  s.deps.db.claim = async (id, l, n) => {
    if (id === broken.id) throw new Error("getnet_callbacks_claim_failed");
    return await orig(id, l, n);
  };
  const res = await reconcile(s);
  assertEquals(res.status, 200);
  const sum = await summary(res);
  assertEquals([sum.checked, sum.errors, sum.done], [2, 1, 1]);
  assertEquals([broken.state, ok2.state], ["pending", "done"]);
  assertEquals(s.heartbeats.length, 1);
});

Deno.test("S-09: no callback inline o claim perdido (reconcile levou a linha) => 200 sem processar; ganho => lease liberado ao final", async () => {
  const lost = build({ claimTaken: true });
  assertEquals((await run(lost, url())).status, 200);
  assertEquals(lost.rows[0].state, "received");
  assertEquals(lost.calls.length, 0);
  assertEquals(lost.claims.length, 1);

  const won = build();
  await run(won, url());
  assertEquals(won.claims, ["row-1"]);
  assertEquals([won.rows[0].state, won.rows[0].locked_until], ["done", null]);
});

// ---------------------------------------------------------------------------
// S-10: corpo só com contadores, heartbeat
// ---------------------------------------------------------------------------

Deno.test("S-10: resposta só com contadores (sem ids, valores, nomes de pedido ou segredos) e logs sem segredo", async () => {
  const s = build();
  seed(s, { received_at: ago(MIN) });
  seed(s, { received_at: ago(3 * HOUR) }); // expira
  seed(s, { payment_type: "pix", error: "pix_pending", received_at: ago(MIN) });
  const logged: string[] = [];
  const [oLog, oErr] = [console.log, console.error];
  console.log = (...a: unknown[]) => void logged.push(a.join(" "));
  console.error = (...a: unknown[]) => void logged.push(a.join(" "));
  let res: Response;
  try {
    res = await reconcile(s);
  } finally {
    console.log = oLog;
    console.error = oErr;
  }
  const body = await res.json();
  assertEquals(Object.keys(body).sort(), ["checked", "done", "errors", "expired", "ignored", "needs_review", "ok", "pending", "skipped"]);
  assertEquals(body.ok, true);
  for (const [k, v] of Object.entries(body)) if (k !== "ok") assertEquals(typeof v, "number", k);
  const text = JSON.stringify(body) + logged.join("\n");
  for (const needle of [ORDER_ID, PAY, "#1026", "gid:", SECRET, RSECRET, "Bearer"]) assertFalse(text.includes(needle), needle);
});

Deno.test("S-10: heartbeat gravado em toda execução autorizada, inclusive fila vazia; nunca em 404", async () => {
  const empty = build();
  const sum = await summary(await reconcile(empty));
  assertEquals(sum, { checked: 0, done: 0, pending: 0, needs_review: 0, ignored: 0, expired: 0, skipped: 0, errors: 0 });
  assertEquals(empty.heartbeats, [NOW.toISOString()]);

  const busy = build();
  seed(busy, { received_at: ago(MIN) });
  await reconcile(busy);
  assertEquals(busy.heartbeats, [NOW.toISOString()]);

  await handleGetnetCallback(reconcileReq({}), busy.deps); // 404
  assertEquals(busy.heartbeats.length, 1);
});

Deno.test("S-10: falha ao listar ou ao gravar o heartbeat => 500 (net._http_response mostra a falha), sem heartbeat falso", async () => {
  const list = build({ failList: true });
  const r1 = await reconcile(list);
  assertEquals(r1.status, 500);
  assertEquals(await r1.json(), { code: "internal_error" });
  assertEquals(list.heartbeats.length, 0);

  const hb = build({ failHeartbeat: true });
  assertEquals((await reconcile(hb)).status, 500);
});

// ---------------------------------------------------------------------------
// S-07b/c: o callback só grava sob fila cheia ou rajada; o reconcile consome
// ---------------------------------------------------------------------------

Deno.test("S-07c: fila > 500 (received|pending) => o GET só grava `received` e responde 200 (repasse segue); o reconcile processa depois", async () => {
  const env = { GETNET_FORWARD_CREDIT_URL: "https://x.getnet.com.br/cb" };
  const full = build({ env });
  for (let i = 0; i < 500; i++) seed(full, { received_at: ago(HOUR), locked_until: ago(-MIN) });
  assertEquals((await run(full, url())).status, 200);
  const row = full.rows.at(-1)!;
  assertEquals([row.state, row.attempts], ["received", 0]);
  assertEquals(full.calls.length, 0); // nenhuma chamada à Shopify no GET
  assertEquals(full.claims.length, 0);
  assertEquals(full.forwarded.length, 1); // o repasse à Getnet não é afetado

  const sum = await summary(await reconcile(full)); // as 500 antigas estão com lease: só a nova é processada
  assertEquals([sum.done, sum.skipped], [1, 19]);
  assertEquals(row.state, "done");

  // exatamente 500 (499 + a própria) ainda processa inline
  const edge = build();
  for (let i = 0; i < 499; i++) seed(edge, { received_at: ago(HOUR), locked_until: ago(-MIN) });
  await run(edge, url());
  assertEquals(edge.rows.at(-1)!.state, "done");
});

Deno.test("S-07b: > 30 callbacks no último minuto => o GET só grava `received`; 30 (contando o próprio) ainda processa", async () => {
  const burst = build();
  for (let i = 0; i < 30; i++) seed(burst, { state: "done", received_at: ago(10_000) });
  assertEquals((await run(burst, url())).status, 200);
  assertEquals(burst.rows.at(-1)!.state, "received");
  assertEquals(burst.calls.length, 0);

  const ok30 = build();
  for (let i = 0; i < 29; i++) seed(ok30, { state: "done", received_at: ago(10_000) });
  await run(ok30, url());
  assertEquals(ok30.rows.at(-1)!.state, "done");

  const old = build(); // rajada de 5 min atrás não conta
  for (let i = 0; i < 40; i++) seed(old, { state: "done", received_at: ago(5 * MIN) });
  await run(old, url());
  assertEquals(old.rows.at(-1)!.state, "done");
});

Deno.test("S-07: erro ao contar fila/rajada => fail-closed: grava `received`, 200, sem tocar a Shopify", async () => {
  const s = build({ failCount: true });
  assertEquals((await run(s, url())).status, 200);
  assertEquals(s.rows[0].state, "received");
  assertEquals(s.calls.length, 0);
});

