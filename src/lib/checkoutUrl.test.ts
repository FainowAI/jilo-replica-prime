import { describe, expect, it } from "vitest";
import { appendReturnToCheckoutUrl, formatCheckoutUrl } from "./shopify";

// R80 (2026-09-25): o checkoutUrl da Shopify carrega uma `key` assinada com o estado do
// cart. O bug em produção era guardar a URL da criação e nunca renovar — o PIX5 aplicado
// depois não chegava ao checkout (132,93 em vez de 126,29). O refresh passa a gravar a
// URL fresca; estes testes garantem que a formatação não perde a `key` nova no caminho.
describe("checkoutUrl — a key fresca sobrevive à formatação", () => {
  const fresh =
    "https://checkout.jilomarmitas.com/cart/c/hWNHD54m5PSG33oTbbgctUDy?key=kYaUSxnugVEkrzs4ZY5vF3JmHHTmwLTndmirdC6aHNMnomY9__ggw96rSS4TmOLSm";

  it("formatCheckoutUrl preserva a key e só acrescenta channel", () => {
    const out = new URL(formatCheckoutUrl(fresh));
    expect(out.searchParams.get("key")).toBe(new URL(fresh).searchParams.get("key"));
    expect(out.searchParams.get("channel")).toBe("online_store");
    expect(out.origin + out.pathname).toBe("https://checkout.jilomarmitas.com/cart/c/hWNHD54m5PSG33oTbbgctUDy");
  });

  it("appendReturnToCheckoutUrl em cima da URL formatada mantém key e channel", () => {
    const out = new URL(appendReturnToCheckoutUrl(formatCheckoutUrl(fresh), "https://jilomarmitas.com"));
    expect(out.searchParams.get("key")).toBe(new URL(fresh).searchParams.get("key"));
    expect(out.searchParams.get("channel")).toBe("online_store");
    expect(out.searchParams.get("return_to")).toBe("https://jilomarmitas.com");
  });

  it("uma URL antiga e uma fresca do mesmo cart diferem só pela key", () => {
    const stale = fresh.replace(/key=.*$/, "key=wQo4Y25PXaFE__Jm_ZOz");
    const a = new URL(formatCheckoutUrl(stale));
    const b = new URL(formatCheckoutUrl(fresh));
    expect(a.pathname).toBe(b.pathname);
    expect(a.searchParams.get("key")).not.toBe(b.searchParams.get("key"));
  });
});
