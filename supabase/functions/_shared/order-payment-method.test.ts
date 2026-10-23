import { assertEquals } from "jsr:@std/assert";
import { resolveOrderPaymentMethod } from "./order-payment-method.ts";

Deno.test("tag de pagamento próprio tem precedência sobre o gateway", () => {
  assertEquals(resolveOrderPaymentMethod("alelo, getnet-pix", ["Getnet Pix"]), "alelo");
  assertEquals(resolveOrderPaymentMethod("vr, alelo, getnet-pix", ["Getnet Pix"]), "vr");
});

Deno.test("identifica Getnet Pix por tag normalizada", () => {
  assertEquals(resolveOrderPaymentMethod(" campanha, GETNET-PIX ", ["Getnet Pix"]), "getnet-pix");
});

Deno.test("usa o gateway nativo sem tag conhecida", () => {
  assertEquals(resolveOrderPaymentMethod("conferir-gateway", ["Getnet Pix"]), "Getnet Pix");
  assertEquals(resolveOrderPaymentMethod(null, []), null);
  assertEquals(resolveOrderPaymentMethod(null, "Getnet Pix"), null);
});
