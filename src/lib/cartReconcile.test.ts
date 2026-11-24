import { describe, it, expect, vi } from "vitest";

vi.mock("@/config/shipping", async (orig) => ({
  ...(await orig<object>()),
  isShippingVariant: (id?: string | null) => id === "ship-variant",
}));

import { reconcileCartItems, type ServerCartLine } from "./cartReconcile";
import type { CartItem } from "@/stores/cartStore";

const SHIP = "ship-variant";

const mkItem = (n: number, qty: number, lineId: string | null = `line-${n}`): CartItem => ({
  lineId,
  variantId: `gid://shopify/ProductVariant/${n}`,
  variantTitle: "Default",
  price: { amount: "20.00", currencyCode: "BRL" },
  quantity: qty,
  selectedOptions: [],
  product: { node: { id: `p${n}`, title: `Produto ${n}`, handle: `p${n}` } } as CartItem["product"],
});
const mkLine = (n: number, qty: number, id = `line-${n}`): ServerCartLine => ({
  id,
  quantity: qty,
  merchandise: { id: `gid://shopify/ProductVariant/${n}` },
});
const sum = (its: CartItem[]) => its.reduce((s, i) => s + i.quantity, 0);

describe("reconcileCartItems", () => {
  it("caso real: local 7 em 6 linhas, servidor 3 com 3 linhas qty 0", () => {
    const local = [mkItem(1, 1), mkItem(2, 1), mkItem(3, 1), mkItem(4, 2), mkItem(5, 1), mkItem(6, 1)];
    const server = [mkLine(1, 1), mkLine(2, 1), mkLine(3, 1), mkLine(4, 0), mkLine(5, 0), mkLine(6, 0)];
    const r = reconcileCartItems(local, server);
    expect(r.items).toHaveLength(3);
    expect(sum(r.items)).toBe(3);
    expect(r.adjustments.filter((a) => a.kind === "removed")).toHaveLength(3);
    expect(r.zeroLineIds).toEqual(["line-4", "line-5", "line-6"]);
  });

  it("reduz a quantidade local para a do servidor", () => {
    const r = reconcileCartItems([mkItem(1, 3)], [mkLine(1, 2)]);
    expect(r.items[0].quantity).toBe(2);
    expect(r.adjustments).toEqual([
      { variantId: "gid://shopify/ProductVariant/1", title: "Produto 1", from: 3, to: 2, kind: "reduced" },
    ]);
  });

  it("preenche lineId nulo pelo variantId", () => {
    const r = reconcileCartItems([mkItem(1, 2, null)], [mkLine(1, 2, "srv-line")]);
    expect(r.items[0].lineId).toBe("srv-line");
    expect(r.adjustments).toEqual([]);
  });

  it("linha do servidor sem item local é incluída (invariante de soma)", () => {
    const server: ServerCartLine[] = [
      mkLine(1, 1),
      {
        id: "line-9",
        quantity: 4,
        merchandise: {
          id: "gid://shopify/ProductVariant/9",
          title: "Default",
          price: { amount: "30.00", currencyCode: "BRL" },
          product: { id: "p9", title: "Produto 9", handle: "p9" },
        },
      },
    ];
    const r = reconcileCartItems([mkItem(1, 1)], server);
    expect(sum(r.items)).toBe(5);
    expect(r.items.find((i) => i.lineId === "line-9")?.product.node.title).toBe("Produto 9");
  });

  it("nada muda quando sincronizado", () => {
    const local = [mkItem(1, 2), mkItem(2, 5)];
    const r = reconcileCartItems(local, [mkLine(1, 2), mkLine(2, 5)]);
    expect(r.items).toEqual(local);
    expect(r.adjustments).toEqual([]);
    expect(r.zeroLineIds).toEqual([]);
  });

  it("variant fantasma de frete fica fora da conciliação", () => {
    const ship: CartItem = { ...mkItem(1, 1, "ship-line"), variantId: SHIP };
    const r = reconcileCartItems([mkItem(2, 1), ship], [mkLine(2, 1)]);
    expect(r.items).toContain(ship);
    const r2 = reconcileCartItems(
      [mkItem(2, 1)],
      [mkLine(2, 1), { id: "ship-line", quantity: 1, merchandise: { id: SHIP } }],
    );
    expect(r2.items).toHaveLength(1);
    expect(r2.adjustments).toEqual([]);
  });
});
