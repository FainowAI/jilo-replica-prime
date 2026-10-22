import { describe, expect, it } from "vitest";
import { SOP_CLASS, sopHolderName, sopInvalidMessage } from "./sop";

// Mesmo regex do silentorderpost-1.0.min.js.
const SOP_HOLDER_RE = /^[a-zA-Z ]{1,64}$/;

describe("sopHolderName", () => {
  it("tira acento e pontuação e deixa no formato do SOP", () => {
    expect(sopHolderName("  Antônio d'Ávila-Conceição ")).toBe("ANTONIO D AVILA CONCEICAO");
    expect(SOP_HOLDER_RE.test(sopHolderName("José Ñúñez 2º"))).toBe(true);
  });

  it("corta em 64 caracteres", () => {
    expect(sopHolderName("a".repeat(80))).toHaveLength(64);
  });
});

describe("sopInvalidMessage", () => {
  it("aponta o campo recusado", () => {
    expect(sopInvalidMessage([{ Field: SOP_CLASS.cvv }])).toMatch(/CVV/);
    expect(sopInvalidMessage([{ Field: SOP_CLASS.holder }, { Field: SOP_CLASS.cvv }])).toMatch(/nome/);
    expect(sopInvalidMessage([{ Field: "AccessToken" }])).toBe("Confira os dados do cartão. (AccessToken)");
    expect(sopInvalidMessage(undefined)).toBe("Confira os dados do cartão.");
  });
});
