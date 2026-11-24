import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/shipping", async (orig) => ({
  ...(await orig<object>()),
  isShippingVariant: (id?: string | null) => id === "ship-variant",
}));
vi.mock("@/analytics/events", () => ({ analytics: { itemAdicionado: vi.fn(), kitMontado: vi.fn() } }));
vi.mock("@/lib/shopify", () => ({
  createShopifyCart: vi.fn(),
  addLineToShopifyCart: vi.fn(),
  updateShopifyCartLine: vi.fn(),
  removeLineFromShopifyCart: vi.fn(),
  fetchShopifyCart: vi.fn(),
  applyDiscountCodesToCart: vi.fn(),
  removeDiscountCodesFromCart: vi.fn(),
  fetchCartFull: vi.fn(),
  formatCheckoutUrl: (u: string) => u,
}));

import * as shopify from "@/lib/shopify";
import { useCartStore, __resetCartMutationState, type CartItem } from "./cartStore";

const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const mkItem = (n: number, qty: number, lineId: string | null = `line-${n}`): CartItem => ({
  lineId,
  variantId: V(n),
  variantTitle: "Default",
  price: { amount: "20.00", currencyCode: "BRL" },
  quantity: qty,
  selectedOptions: [],
  product: { node: { id: `p${n}`, title: `Produto ${n}`, handle: `p${n}`, productType: "", tags: [] } } as CartItem["product"],
});
const line = (n: number, quantity: number, id = `line-${n}`) => ({
  node: { id, quantity, merchandise: { id: V(n) }, discountAllocations: [] },
});
const cartOf = (...lines: ReturnType<typeof line>[]) => ({
  checkoutUrl: "https://x/checkout",
  cost: { totalAmount: { amount: "10" }, subtotalAmount: { amount: "10" } },
  discountAllocations: [],
  lines: { edges: lines },
});

const sumItems = () => useCartStore.getState().items.reduce((s, i) => s + i.quantity, 0);

beforeEach(() => {
  vi.clearAllMocks();
  __resetCartMutationState();
  useCartStore.setState({ items: [], cartId: "cart-1", cartAdjustments: [], discountCodes: [] });
});

describe("cartStore.refreshCartDetails — conciliação", () => {
  it("concilia items com o servidor e remove linhas zeradas na Shopify", async () => {
    useCartStore.setState({ items: [mkItem(1, 1), mkItem(2, 2), mkItem(3, 4)] });
    vi.mocked(shopify.fetchCartFull).mockResolvedValue(cartOf(line(1, 1), line(2, 0), line(3, 0)));
    vi.mocked(shopify.removeLineFromShopifyCart).mockResolvedValue({ success: true });

    const adj = await useCartStore.getState().refreshCartDetails();

    expect(sumItems()).toBe(1);
    expect(adj.map((a) => a.kind)).toEqual(["removed", "removed"]);
    expect(useCartStore.getState().cartAdjustments).toHaveLength(2);
    expect(shopify.removeLineFromShopifyCart).toHaveBeenCalledWith("cart-1", ["line-2", "line-3"]);

    useCartStore.getState().clearCartAdjustments();
    expect(useCartStore.getState().cartAdjustments).toEqual([]);
  });

  it("erro ao remover linhas zeradas não quebra o refresh", async () => {
    useCartStore.setState({ items: [mkItem(1, 1), mkItem(2, 2)] });
    vi.mocked(shopify.fetchCartFull).mockResolvedValue(cartOf(line(1, 1), line(2, 0)));
    vi.mocked(shopify.removeLineFromShopifyCart).mockRejectedValue(new Error("boom"));
    await useCartStore.getState().refreshCartDetails();
    expect(sumItems()).toBe(1);
    expect(useCartStore.getState().checkoutUrl).toBe("https://x/checkout");
  });

  it("refresh concorrente com mutação em voo NÃO apaga o item recém-adicionado", async () => {
    useCartStore.setState({ items: [mkItem(1, 1)] });
    // O servidor (snapshot antigo) ainda não tem a linha do item 2.
    let releaseFetch!: () => void;
    vi.mocked(shopify.fetchCartFull).mockImplementationOnce(
      () => new Promise((res) => { releaseFetch = () => res(cartOf(line(1, 1))); }),
    );
    const refreshing = useCartStore.getState().refreshCartDetails();

    // Mutação (addItem de variant nova) começa e termina enquanto o fetch está pendente.
    vi.mocked(shopify.addLineToShopifyCart).mockResolvedValue({ success: true, lineId: "line-2" });
    vi.mocked(shopify.fetchCartFull).mockResolvedValue(cartOf(line(1, 1), line(2, 1)));
    await useCartStore.getState().addItem({ ...mkItem(2, 1), lineId: undefined } as never);
    expect(useCartStore.getState().items.map((i) => i.variantId)).toContain(V(2));

    releaseFetch();
    const adj = await refreshing;
    expect(adj).toEqual([]);
    expect(useCartStore.getState().items.map((i) => i.variantId)).toContain(V(2));
  });
});

describe("cartStore.removeItem", () => {
  it("remove do local quando a linha já não existe no servidor", async () => {
    useCartStore.setState({ items: [mkItem(1, 1), mkItem(2, 2)] });
    vi.mocked(shopify.removeLineFromShopifyCart).mockResolvedValue({ success: false });
    vi.mocked(shopify.fetchCartFull).mockResolvedValue(cartOf(line(1, 1)));

    await useCartStore.getState().removeItem(V(2));

    expect(useCartStore.getState().items.map((i) => i.variantId)).toEqual([V(1)]);
  });

  it("lineId nulo: refresh preenche o lineId e a remoção segue", async () => {
    useCartStore.setState({ items: [mkItem(1, 1), mkItem(2, 2, null)] });
    vi.mocked(shopify.fetchCartFull).mockResolvedValue(cartOf(line(1, 1), line(2, 2)));
    vi.mocked(shopify.removeLineFromShopifyCart).mockResolvedValue({ success: true });

    await useCartStore.getState().removeItem(V(2));

    expect(shopify.removeLineFromShopifyCart).toHaveBeenCalledWith("cart-1", "line-2");
    expect(useCartStore.getState().items.map((i) => i.variantId)).toEqual([V(1)]);
  });
});
