import { describe, it, expect } from "vitest";
import { luhnValid, isValidCpf, expiryToAAMM, onlyDigits, formatCardNumber, formatCpf } from "@/lib/vr/card";

describe("luhnValid", () => {
  it("aceita cartão válido", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
  });

  it("rejeita cartão com dígito verificador errado", () => {
    expect(luhnValid("4111111111111112")).toBe(false);
  });

  it("rejeita tamanho errado", () => {
    expect(luhnValid("411111111111")).toBe(false);
    expect(luhnValid("41111111111111111")).toBe(false);
  });
});

describe("isValidCpf", () => {
  it("aceita CPF válido com máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
  });

  it("aceita CPF válido sem máscara", () => {
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("rejeita sequência repetida", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });

  it("rejeita dígito verificador errado", () => {
    expect(isValidCpf("529.982.247-26")).toBe(false);
  });
});

describe("expiryToAAMM", () => {
  it("converte MM/AA para AAMM", () => {
    expect(expiryToAAMM("12/99")).toBe("9912");
  });

  it("converte MMAA sem barra", () => {
    expect(expiryToAAMM("1299")).toBe("9912");
  });

  it("rejeita mês fora de 1-12", () => {
    expect(expiryToAAMM("13/28")).toBe(null);
  });

  it("rejeita mês já expirado", () => {
    expect(expiryToAAMM("01/20")).toBe(null);
  });
});

describe("onlyDigits / formatCardNumber / formatCpf", () => {
  it("onlyDigits remove não-dígitos", () => {
    expect(onlyDigits("529.982.247-25")).toBe("52998224725");
  });

  it("formatCardNumber agrupa em blocos de 4", () => {
    expect(formatCardNumber("4111111111111111")).toBe("4111 1111 1111 1111");
  });

  it("formatCpf aplica máscara padrão", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });
});
