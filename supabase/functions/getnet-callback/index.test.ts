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
}

interface Opts {
  env?: Partial<GetnetCallbackDeps["env"]>;
  /** Resposta de `findOrders` por número da chamada (1, 2, ...). */
  orders?: (n: number) => ShopifyOrderLite[];
  markAsPaid?: () => Promise<{ ok: boolean }>;
  addTag?: () => Promise<void>;
  failInsert?: boolean;
  paidSince?: number;
  forward?: (u: string) => Promise<boolean>;
  findThrows?: boolean;
}

function build(o: Opts = {}): Spy {
  const rows: CallbackRow[] = [];
  const calls: string[] = [];
  const inserts: NewCallback[] = [];
  const patches: Spy["patches"] = [];
  const forwarded: string[] = [];
  const bg: Promise<unknown>[] = [];
  let finds = 0;
  const deps: GetnetCallbackDeps = {
    env: {
      GETNET_CALLBACK_ENABLED: "true",
      GETNET_CALLBACK_LIVE: "true",
      GETNET_CALLBACK_SECRET: SECRET,
      GETNET_CALLBACK_SECRET_PREV: null,
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
        const row: CallbackRow = { id: `row-${rows.length + 1}`, ...i, state: "received", attempts: 0 };
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
    },
    shopify: {
      async findOrders(paymentId) {
        calls.push(`find:${paymentId}`);
        finds++;
        if (o.findThrows) throw new Error("shopify_admin_http_429");
        return (o.orders ?? (() => [order()]))(finds);
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
  return { deps, rows, calls, inserts, patches, forwarded, bg };
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

Deno.test("S-02: parâmetros inválidos/injeção/chave repetida/ausente => 400 sem gravar, consultar ou repassar", async () => {
  const cases: [string, Record<string, string> | string][] = [
    ["order_id com OR", { ...GOOD_QUERY, order_id: "x OR name:#1030 aaaaaaaa" }],
    ["order_id com espaço", { ...GOOD_QUERY, order_id: "aaaaaaaaaa bbbbbbbbbb" }],
    ["order_id curinga", { ...GOOD_QUERY, order_id: "*" }],
    ["order_id curinga longo", { ...GOOD_QUERY, order_id: "aaaaaaaaaa*" }],
    ["order_id aspas", { ...GOOD_QUERY, order_id: 'aaaaaaaaaa"bbbb' }],
    ["order_id dois-pontos", { ...GOOD_QUERY, order_id: "payment_id:aaaaaaaaaa" }],
    ["order_id curto", { ...GOOD_QUERY, order_id: "abc" }],
    ["order_id longo", { ...GOOD_QUERY, order_id: "a".repeat(65) }],
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
  const s = build({ env: { GETNET_FORWARD_CREDIT_URL: "https://x.getnet.com.br/cb" } });
  for (const [name, q] of cases) {
    assertEquals((await run(s, url(q))).status, 400, name);
  }
  assertEquals(s.inserts.length, 0);
  assertEquals(s.calls.length, 0);
  assertEquals(s.forwarded.length, 0);
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

Deno.test("S-08: INSERT falho != 23505 => 500, nada consultado nem repassado", async () => {
  const s = build({ failInsert: true, env: { GETNET_FORWARD_CREDIT_URL: "https://x.getnet.com.br/cb" } });
  assertEquals((await run(s, url())).status, 500);
  assertEquals(s.calls.length, 0);
  assertEquals(s.forwarded.length, 0);
});

Deno.test("duplicado igual => 200 sem efeito (sem nova consulta, sem novo repasse)", async () => {
  const s = build({ env: { GETNET_FORWARD_CREDIT_URL: "https://x.getnet.com.br/cb" } });
  assertEquals((await run(s, url())).status, 200);
  const findsAfterFirst = s.calls.length;
  assertEquals(s.forwarded.length, 1);
  assertEquals((await run(s, url())).status, 200);
  assertEquals(s.rows.length, 1);
  assertEquals(s.calls.length, findsAfterFirst);
  assertEquals(s.forwarded.length, 1); // repasse só na 1ª gravação (S-13)
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
  const s = build({ findThrows: true });
  assertEquals((await run(s, url())).status, 200);
  assertEquals(s.rows[0].state, "pending");
  assertEquals(s.rows[0].attempts, 1);
  assertEquals(s.patches.at(-1)?.patch.error, "shopify_admin_http_429");
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

Deno.test("repasse: 1ª gravação, query reserializada dos 5 parâmetros, sem segredo, por tipo; grava forwarded_at", async () => {
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
    ["amount", "order_id", "payment_id", "payment_type", "status", "token"],
  ); // parâmetro extra do chamador não vaza para a Getnet
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

Deno.test("repasse: nenhum nos caminhos 400, 404, sem query e INSERT falho", async () => {
  const env = { GETNET_FORWARD_CREDIT_URL: "https://x.getnet.com.br/cb", GETNET_FORWARD_PIX_URL: "https://x.getnet.com.br/pix" };
  const s = build({ env });
  await run(s, url({ ...GOOD_QUERY, amount: "1.5" }));
  await run(s, url(GOOD_QUERY, "x".repeat(34)));
  await run(s, url(null));
  await run(build({ env, failInsert: true }), url());
  assertEquals(s.forwarded.length, 0);
});
