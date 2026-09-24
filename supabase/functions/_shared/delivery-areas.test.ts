import { assertEquals } from "jsr:@std/assert";
import { isAreaDeliverable } from "./delivery-areas.ts";

Deno.test("isAreaDeliverable ignora acento, caixa e espaços na cidade", () => {
  assertEquals(isAreaDeliverable("SP", "São José dos Campos"), true);
  assertEquals(isAreaDeliverable("SP", "Sao Jose Dos Campos"), true);
  assertEquals(isAreaDeliverable("SP", "  são josé  dos campos "), true);
  assertEquals(isAreaDeliverable("SP", "Jacareí"), false);
  assertEquals(isAreaDeliverable("RJ", "São José dos Campos"), false);
});
