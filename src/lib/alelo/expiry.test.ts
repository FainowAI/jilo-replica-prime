import { describe, expect, it } from "vitest";
import { composeExpiry } from "./expiry";

// Construtor local (não "2026-10-13", que o JS lê como UTC e pode virar o mês em BRT).
const hoje = new Date(2026, 9, 13); // 13/out/2026

describe("composeExpiry", () => {
  it("mês e ano de 2 dígitos viram MM/20AA", () => {
    expect(composeExpiry("07", "34", hoje)).toBe("07/2034");
  });

  it("mês de 1 dígito é completado e ano de 4 dígitos é mantido", () => {
    expect(composeExpiry("7", "2034", hoje)).toBe("07/2034");
  });

  it("mês fora de 1–12 é inválido", () => {
    expect(composeExpiry("13", "34", hoje)).toBeNull();
    expect(composeExpiry("00", "34", hoje)).toBeNull();
    expect(composeExpiry("0", "34", hoje)).toBeNull();
  });

  it("ano com 1 ou 3 dígitos, vazio ou com não-dígitos é inválido", () => {
    expect(composeExpiry("07", "3", hoje)).toBeNull();
    expect(composeExpiry("07", "203", hoje)).toBeNull();
    expect(composeExpiry("07", "", hoje)).toBeNull();
    expect(composeExpiry("", "34", hoje)).toBeNull();
    expect(composeExpiry("0a", "34", hoje)).toBeNull();
    expect(composeExpiry("07", "2O34", hoje)).toBeNull();
  });

  it("data vencida é inválida", () => {
    expect(composeExpiry("09", "26", hoje)).toBeNull(); // mês anterior do ano atual
    expect(composeExpiry("12", "25", hoje)).toBeNull(); // ano anterior
    expect(composeExpiry("12", "2025", hoje)).toBeNull();
  });

  it("mês atual do ano atual ainda é válido; o mês seguinte também", () => {
    expect(composeExpiry("10", "26", hoje)).toBe("10/2026");
    expect(composeExpiry("10", "2026", hoje)).toBe("10/2026");
    expect(composeExpiry("11", "2026", hoje)).toBe("11/2026");
  });
});
