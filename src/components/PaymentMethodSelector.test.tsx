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
  });

  it("oculta Alelo com a flag desligada e nunca mostra PayPal", async () => {
    vi.stubEnv("VITE_ALELO_ENABLED", "false");
    await renderSelector();
    expect(screen.queryByText("Alelo Refeição / Alimentação")).toBeNull();
    expect(screen.queryByText(/paypal/i)).toBeNull();
    expect(screen.getByText("Cartão de crédito")).toBeTruthy();
  });

  it("mostra Alelo com a flag ligada", async () => {
    vi.stubEnv("VITE_ALELO_ENABLED", "true");
    await renderSelector();
    expect(screen.getByText("Alelo Refeição / Alimentação")).toBeTruthy();
    expect(screen.queryByText(/paypal/i)).toBeNull();
  });
});
