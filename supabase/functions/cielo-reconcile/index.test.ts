import { assertEquals } from "jsr:@std/assert";
import { CieloApiError, type CieloSale } from "../_shared/cielo-client.ts";
import { handleCieloReconcile, type PendingRow, type ReconcileDeps } from "./handler.ts";

const NOW = new Date("2026-10-12T15:00:00Z"); // 12:00 BRT
const SALE: CieloSale = { paymentId: "p1", merchantOrderId: "MO1", status: 2, returnCode: "00", amountCents: 1000 };

function row(over: Partial<PendingRow> = {}): PendingRow {
  return { id: "r1", merchant_order_id: "MO1", cielo_payment_id: null, status: "authorizing", shopify_draft_order_id: "d1", created_at: "2026-10-12T14:30:00Z", ...over };
}

function build(rows: PendingRow[], o: { cielo?: Partial<ReconcileDeps["cielo"]>; draft?: Partial<ReconcileDeps["draft"]> } = {}) {
  const updates: Record<string, unknown>[] = [];
  const calls: string[] = [];
  const alerts: string[] = [];
  const deps: ReconcileDeps = {
    secrets: { serviceKey: "svc-key", reconcileSecret: "rec-secret" },
    db: { listPending: async () => rows, update: async (_id, p) => { updates.push(p); } },
    cielo: {
      findSalesByMerchantOrderId: async () => ["p1"],
      getSale: async () => SALE,
      voidSale: async () => { calls.push("void"); return { ...SALE, status: 10 }; },
      ...o.cielo,
    },
    draft: { getStatus: async () => ({ status: "OPEN", order: null }), delete: async () => { calls.push("draft_delete"); }, ...o.draft },
    sendAlert: async (a) => { alerts.push(a.event); },
    now: () => NOW,
  };
  return { deps, updates, calls, alerts };
}

const call = (deps: ReconcileDeps, auth: string | null = "Bearer svc-key", method = "POST") =>
  handleCieloReconcile(new Request("http://localhost/cielo-reconcile", { method, headers: auth ? { Authorization: auth } : {} }), deps);

Deno.test("guard: sem header / errado => 401; GET => 405; service key e secret passam", async () => {
  const { deps } = build([]);
  assertEquals((await call(deps, null)).status, 401);
  assertEquals((await call(deps, "Bearer nope")).status, 401);
  assertEquals((await call(deps, "Bearer svc-key", "GET")).status, 405);
  assertEquals((await call(deps)).status, 200);
  assertEquals((await call(deps, "Bearer rec-secret")).status, 200);
  const noSecrets = { ...deps, secrets: { serviceKey: null, reconcileSecret: null } };
  assertEquals((await call(noSecrets, "Bearer ")).status, 401);
});

Deno.test("D0: aprovada sem pedido, draft OPEN => void (voided_auto)", async () => {
  const { deps, calls, updates } = build([row()]);
  const j = await (await call(deps)).json();
  assertEquals(j, { checked: 1, approved: 0, voided: 1, alerted: 0 });
  assertEquals(calls.includes("void"), true);
  assertEquals(updates.at(-1)?.status, "voided_auto");
});

Deno.test("D+1: aprovada sem pedido => NÃO anula, alerta", async () => {
  const { deps, calls, alerts } = build([row({ created_at: "2026-10-11T14:00:00Z" })]);
  const j = await (await call(deps)).json();
  assertEquals(j, { checked: 1, approved: 0, voided: 0, alerted: 1 });
  assertEquals(calls.includes("void"), false);
  assertEquals(alerts, ["past_d0_manual"]);
});

Deno.test("draft COMPLETED => approved, sem void", async () => {
  const { deps, calls, updates } = build([row()], { draft: { getStatus: async () => ({ status: "COMPLETED", order: { id: "o", name: "#1" } }) } });
  const j = await (await call(deps)).json();
  assertEquals(j.approved, 1);
  assertEquals(calls.includes("void"), false);
  assertEquals(updates.at(-1)?.status, "approved");
});

Deno.test("lista vazia (ou 404) libera o cart como error", async () => {
  for (const find of [async () => [], async () => { throw new CieloApiError({ code: "cielo_http_404", status: 404 }); }]) {
    const { deps, updates } = build([row()], { cielo: { findSalesByMerchantOrderId: find } });
    await call(deps);
    assertEquals(updates.at(-1)?.status, "error");
  }
});

Deno.test("consulta falha => mantém authorizing e alerta", async () => {
  const { deps, updates, alerts } = build([row()], { cielo: { findSalesByMerchantOrderId: async () => { throw new Error("x"); } } });
  const j = await (await call(deps)).json();
  assertEquals(j.alerted, 1);
  assertEquals(updates.length, 0);
  assertEquals(alerts, ["lookup_failed"]);
});

Deno.test("recusada => declined; void_failed em D0 tenta void de novo", async () => {
  const d = build([row()], { cielo: { getSale: async () => ({ ...SALE, status: 3, returnCode: "51" }) } });
  await call(d.deps);
  assertEquals(d.updates.at(-1)?.status, "declined");

  const v = build([row({ status: "void_failed", cielo_payment_id: "p1" })]);
  const j = await (await call(v.deps)).json();
  assertEquals(j.voided, 1);
});

Deno.test("M4: status 1 (Authorized) em D0 => void + alerta; após D0 só alerta", async () => {
  const auth = { getSale: async () => ({ ...SALE, status: 1, returnCode: "4" }) };
  const d0 = build([row()], { cielo: auth });
  const j = await (await call(d0.deps)).json();
  assertEquals(j.voided, 1);
  assertEquals(d0.calls.includes("void"), true);
  assertEquals(d0.updates.at(-1)?.status, "voided_auto");
  assertEquals(d0.alerts, ["authorized_voided"]);

  const old = build([row({ created_at: "2026-10-11T14:00:00Z" })], { cielo: auth });
  await call(old.deps);
  assertEquals(old.calls.includes("void"), false);
  assertEquals(old.alerts, ["non_terminal"]);
});

Deno.test("void falha => void_failed + alerta", async () => {
  const { deps, updates, alerts } = build([row()], { cielo: { voidSale: async () => { throw new Error("v"); } } });
  await call(deps);
  assertEquals(updates.at(-1)?.status, "void_failed");
  assertEquals(alerts, ["void_failed"]);
});
