import { describe, it, expect } from "vitest";
import { computePixTotals } from "./pixCoupons";

describe("computePixTotals", () => {
  it("usa o total da Shopify quando informado e válido", () => {
    expect(computePixTotals(13608, 5, 12928)).toEqual({
      pixTotalCents: 12928,
      pixDiscountCents: 680,
    });
  });

  it("cai no fallback local (percent sobre a base) quando não há total da Shopify", () => {
    expect(computePixTotals(13293, 5)).toEqual({
      pixTotalCents: 12628,
      pixDiscountCents: 665,
    });
  });

  it("base zero ou negativa retorna tudo zerado", () => {
    expect(computePixTotals(0, 5, 12928)).toEqual({ pixTotalCents: 0, pixDiscountCents: 0 });
  });

  it("ignora total da Shopify inválido (maior que a base ou nulo) e usa o fallback", () => {
    expect(computePixTotals(13293, 5, 99999)).toEqual({
      pixTotalCents: 12628,
      pixDiscountCents: 665,
    });
    expect(computePixTotals(13293, 5, null)).toEqual({
      pixTotalCents: 12628,
      pixDiscountCents: 665,
    });
  });

  it("rejeita total da Shopify com desconto implícito absurdo (cart dessincronizado) e usa o fallback", () => {
    // caso real: base 149,81 local vs 63,52 da Shopify (3 itens) => desconto de 749 (5%)
    expect(computePixTotals(14981, 5, 6352)).toEqual({
      pixTotalCents: 14232,
      pixDiscountCents: 749,
    });
  });

  it("aceita diferença de centavos de arredondamento dentro da tolerância", () => {
    expect(computePixTotals(13608, 5, 12900)).toEqual({
      pixTotalCents: 12900,
      pixDiscountCents: 708,
    });
  });
});
