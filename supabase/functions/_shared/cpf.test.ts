import { assertEquals } from "jsr:@std/assert";
import { isValidCpf } from "./cpf.ts";

Deno.test("isValidCpf aceita CPF válido", () => {
  assertEquals(isValidCpf("52998224725"), true);
});

Deno.test("isValidCpf rejeita dígito verificador errado", () => {
  assertEquals(isValidCpf("52998224726"), false);
});

Deno.test("isValidCpf rejeita sequência repetida", () => {
  assertEquals(isValidCpf("11111111111"), false);
});

Deno.test("isValidCpf rejeita tamanho errado", () => {
  assertEquals(isValidCpf("5299822472"), false);
  assertEquals(isValidCpf("529982247255"), false);
});
