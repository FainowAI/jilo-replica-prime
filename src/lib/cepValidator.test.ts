import { describe, it, expect } from "vitest";
import { isAreaDeliverable } from "./cepValidator";

describe("isAreaDeliverable", () => {
  it("aceita a cidade com acento, como está na whitelist", () => {
    expect(isAreaDeliverable("SP", "São José dos Campos")).toBe(true);
  });

  it("aceita a cidade sem acento", () => {
    expect(isAreaDeliverable("SP", "Sao Jose Dos Campos")).toBe(true);
  });

  it("aceita a cidade com caixa e espaços diferentes", () => {
    expect(isAreaDeliverable("SP", "  são josé  dos campos ")).toBe(true);
  });

  it("recusa cidade fora da whitelist", () => {
    expect(isAreaDeliverable("SP", "Jacareí")).toBe(false);
  });

  it("recusa UF fora da whitelist mesmo com cidade correta", () => {
    expect(isAreaDeliverable("RJ", "São José dos Campos")).toBe(false);
  });
});
