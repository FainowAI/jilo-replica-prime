import { assertEquals } from "jsr:@std/assert";
import type { CieloSale } from "./cielo-client.ts";
import { classifySale, passesQaGate } from "./cielo-support.ts";

const sale = (status: number, returnCode: string, over: Partial<CieloSale> = {}): CieloSale => ({
  paymentId: "p", merchantOrderId: "m", status, returnCode, amountCents: 1, ...over,
});

Deno.test("classifySale: Status 0 + código de erro = failed; 'tente mais tarde' ou vazio = pending", () => {
  assertEquals(classifySale(sale(0, "002")), "failed"); // 04/11/2026: Credenciais inválidas
  assertEquals(classifySale(sale(0, "GF")), "failed");
  assertEquals(classifySale(sale(0, "51")), "failed");
  assertEquals(classifySale(sale(0, "")), "pending");
  for (const c of ["98", "999", "AA", "BP900", "91", "94", "99"]) assertEquals(classifySale(sale(0, c)), "pending", c);
  for (const c of ["05", "ZZ", "06"]) assertEquals(classifySale(sale(0, c)), "pending", c); // genérico/desconhecido: lista positiva
  assertEquals(classifySale(sale(0, "00")), "pending"); // 00 sem Status 2: ainda não confirmada
  assertEquals(classifySale(sale(1, "4")), "pending");
  assertEquals(classifySale(sale(12, "")), "pending");
  assertEquals(classifySale(sale(0, "", { tryAutomaticCancellation: true })), "failed");
  assertEquals(classifySale(sale(1, "4", { tryAutomaticCancellation: true })), "pending"); // flag só vale em Status 0 (M4)
  assertEquals(classifySale(sale(12, "", { tryAutomaticCancellation: true })), "pending");
  assertEquals(classifySale(sale(2, "00")), "approved");
  assertEquals(classifySale(sale(2, "51")), "declined");
  assertEquals(classifySale(sale(3, "51")), "declined");
  assertEquals(classifySale(sale(3, "002")), "failed"); // cadastro nosso em Denied: não é recusa do cliente
  assertEquals(classifySale(sale(13, "")), "declined");
  assertEquals(classifySale(sale(10, "9")), "voided");
  assertEquals(classifySale(sale(11, "")), "voided");
});

Deno.test("passesQaGate: fora de prod exige allowlist", () => {
  assertEquals(passesQaGate("sandbox", "a@x.com", ""), false);
  assertEquals(passesQaGate("sandbox", "A@x.com", "a@x.com"), true);
});

Deno.test("passesQaGate: prod com allowlist = beta fechado", () => {
  assertEquals(passesQaGate("prod", "b@x.com", "a@x.com, c@x.com"), false);
  assertEquals(passesQaGate("prod", "c@x.com", "a@x.com, c@x.com"), true);
});

Deno.test("passesQaGate: prod sem allowlist = aberto", () => {
  assertEquals(passesQaGate("prod", "b@x.com", null), true);
  assertEquals(passesQaGate("prod", "b@x.com", " , "), true);
});
