import { assertEquals } from "jsr:@std/assert";
import { mapFinancialStatus } from "./order-status-map.ts";

Deno.test("expired e voided viram cancelled mantendo payment_status cru", () => {
  assertEquals(mapFinancialStatus("expired"), { status: "cancelled", payment_status: "expired" });
  assertEquals(mapFinancialStatus("voided"), { status: "cancelled", payment_status: "voided" });
});

Deno.test("authorized, partially_paid e pending ficam pending", () => {
  assertEquals(mapFinancialStatus("authorized"), { status: "pending", payment_status: "authorized" });
  assertEquals(mapFinancialStatus("partially_paid"), { status: "pending", payment_status: "partially_paid" });
  assertEquals(mapFinancialStatus(null), { status: "pending", payment_status: "pending" });
});

Deno.test("paid e refunded", () => {
  assertEquals(mapFinancialStatus("paid"), { status: "paid", payment_status: "paid" });
  assertEquals(mapFinancialStatus("refunded"), { status: "refunded", payment_status: "refunded" });
  assertEquals(mapFinancialStatus("partially_refunded"), { status: "refunded", payment_status: "partially_refunded" });
});

Deno.test("cancelledAt vence o financial_status", () => {
  assertEquals(mapFinancialStatus("paid", "2026-10-09T10:00:00Z"), { status: "cancelled", payment_status: "paid" });
  assertEquals(mapFinancialStatus("pending", "2026-10-09T10:00:00Z"), { status: "cancelled", payment_status: "pending" });
});

Deno.test("valor desconhecido nunca viola o CHECK", () => {
  assertEquals(mapFinancialStatus("banana"), { status: "pending", payment_status: "pending" });
});
