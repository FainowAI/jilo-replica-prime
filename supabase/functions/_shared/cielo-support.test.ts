import { assertEquals } from "jsr:@std/assert";
import { passesQaGate } from "./cielo-support.ts";

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
