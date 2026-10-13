import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const renderSelector = async () => {
  const { default: Selector } = await import("./PaymentMethodSelector");
  render(<Selector baseTotalCents={10000} pixTotalCents={9500} totalNonShippingItems={7} />);
};

describe("PaymentMethodSelector", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("oculta Alelo com a flag desligada e nunca mostra PayPal", async () => {
    vi.stubEnv("VITE_ALELO_ENABLED", "false");
    await renderSelector();
    expect(screen.queryByText("Alelo Refeição / Alimentação")).toBeNull();
    expect(screen.queryByText(/paypal/i)).toBeNull();
    expect(screen.getByText("Cartão de crédito")).toBeTruthy();
  });

  it("com a flag ligada, oculta Alelo de quem não entrou no beta (?alelo=1)", async () => {
    vi.stubEnv("VITE_ALELO_ENABLED", "true");
    await renderSelector();
    expect(screen.queryByText("Alelo Refeição / Alimentação")).toBeNull();
  });

  it("mostra Alelo com a flag ligada e ?alelo=1, e lembra no navegador", async () => {
    vi.stubEnv("VITE_ALELO_ENABLED", "true");
    window.history.replaceState(null, "", "/carrinho?alelo=1");
    await renderSelector();
    expect(screen.getByText("Alelo Refeição / Alimentação")).toBeTruthy();
    expect(screen.queryByText(/paypal/i)).toBeNull();
    expect(localStorage.getItem("jilo_alelo_beta")).toBe("1");
  });

  it("?alelo=0 tira o navegador do beta", async () => {
    vi.stubEnv("VITE_ALELO_ENABLED", "true");
    localStorage.setItem("jilo_alelo_beta", "1");
    window.history.replaceState(null, "", "/carrinho?alelo=0");
    await renderSelector();
    expect(screen.queryByText("Alelo Refeição / Alimentação")).toBeNull();
  });
});
