import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ signIn: vi.fn(), signUp: vi.fn() }) }));
vi.mock("@/components/GoogleSignInButton", () => ({ default: () => null, GoogleSignInButton: () => null }));

import AuthDialog from "./AuthDialog";

const RecuperarStub = () => {
  const location = useLocation();
  return <p>recuperar:{(location.state as { email?: string } | null)?.email}</p>;
};

const renderDialog = (onOpenChange = vi.fn(), initialMode?: "login" | "signup") =>
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<AuthDialog open onOpenChange={onOpenChange} initialMode={initialMode} />} />
        <Route path="/recuperar-senha" element={<RecuperarStub />} />
      </Routes>
    </MemoryRouter>,
  );

describe("AuthDialog — Esqueci a senha", () => {
  it("no login, o link fecha o modal e leva o e-mail digitado para /recuperar-senha", () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="email"]')!, {
      target: { value: " cliente@exemplo.com " },
    });
    fireEvent.click(screen.getByRole("link", { name: "Esqueci a senha" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByText("recuperar:cliente@exemplo.com")).toBeTruthy();
  });

  it("no cadastro, o link não aparece", () => {
    renderDialog(vi.fn(), "signup");
    expect(screen.queryByRole("link", { name: "Esqueci a senha" })).toBeNull();
  });
});
