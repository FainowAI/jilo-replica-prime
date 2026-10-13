import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Pedidos from "./Pedidos";

const useOrders = vi.fn();
vi.mock("@/hooks/useOrders", () => ({ useOrders: () => useOrders() }));

const renderPage = () => render(<MemoryRouter><Pedidos /></MemoryRouter>);

describe("Pedidos", () => {
  beforeEach(() => useOrders.mockReset());

  it("mostra erro e refaz a busca ao clicar em Tentar de novo", () => {
    const refetch = vi.fn();
    useOrders.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderPage();
    expect(screen.getByText("Não conseguimos carregar seus pedidos")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("mostra estado vazio quando não há pedidos", () => {
    useOrders.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText("Você ainda não tem pedidos")).toBeInTheDocument();
  });
});
