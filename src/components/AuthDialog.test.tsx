import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

const { signIn, signUp, resendConfirmation, authState, invokeEdge, toast } = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  resendConfirmation: vi.fn(),
  authState: { user: null as { id: string } | null },
  invokeEdge: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ signIn, signUp, resendConfirmation, user: authState.user }),
}));
vi.mock("@/components/GoogleSignInButton", () => ({ default: () => null, GoogleSignInButton: () => null }));
// Nenhuma edge function pode ser chamada para montar a mensagem de erro (sem "oráculo" de conta Google).
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: invokeEdge } } }));
vi.mock("sonner", () => ({ toast }));

import AuthDialog from "./AuthDialog";

const RecuperarStub = () => {
  const location = useLocation();
  return <p>recuperar:{(location.state as { email?: string } | null)?.email}</p>;
};

const ui = (onOpenChange = vi.fn(), initialMode?: "login" | "signup") => (
  <MemoryRouter>
    <Routes>
      <Route path="/" element={<AuthDialog open onOpenChange={onOpenChange} initialMode={initialMode} />} />
      <Route path="/recuperar-senha" element={<RecuperarStub />} />
    </Routes>
  </MemoryRouter>
);

const renderDialog = (onOpenChange = vi.fn(), initialMode?: "login" | "signup") =>
  render(ui(onOpenChange, initialMode));

const emailInput = () => document.querySelector<HTMLInputElement>('input[type="email"]')!;

/** Preenche e envia o formulário (submit direto: não depende da validação nativa do jsdom). */
const submit = async (fields: { email?: string; password?: string; name?: string } = {}) => {
  const { email = "cliente@exemplo.com", password = "123456", name } = fields;
  fireEvent.change(emailInput(), { target: { value: email } });
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="password"]')!, { target: { value: password } });
  if (name) fireEvent.change(document.querySelector<HTMLInputElement>('input[type="text"]')!, { target: { value: name } });
  await act(async () => {
    fireEvent.submit(document.querySelector("form")!);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
});

describe("AuthDialog — Esqueci a senha", () => {
  it("no login, o link fecha o modal e leva o e-mail digitado para /recuperar-senha", () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.change(emailInput(), { target: { value: " cliente@exemplo.com " } });
    fireEvent.click(screen.getByRole("link", { name: "Esqueci a senha" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByText("recuperar:cliente@exemplo.com")).toBeTruthy();
  });

  it("no cadastro, o link não aparece", () => {
    renderDialog(vi.fn(), "signup");
    expect(screen.queryByRole("link", { name: "Esqueci a senha" })).toBeNull();
  });
});

describe("AuthDialog — fechamento", () => {
  it("fecha sozinho quando o user passa a existir (login pelo botão Google)", () => {
    const onOpenChange = vi.fn();
    const { rerender } = renderDialog(onOpenChange);
    expect(onOpenChange).not.toHaveBeenCalled();

    authState.user = { id: "u1" };
    rerender(ui(onOpenChange));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("AuthDialog — desmontagem", () => {
  it("avisa o pai ao desmontar (host que só renderiza o diálogo deslogado)", () => {
    const onOpenChange = vi.fn();
    const { unmount } = renderDialog(onOpenChange);
    expect(onOpenChange).not.toHaveBeenCalled();
    unmount();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("AuthDialog — erros de login", () => {
  it("senha incorreta mostra a mensagem fixa, com 'Esqueci a senha', sem chamar edge", async () => {
    signIn.mockResolvedValue({ error: Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" }) });
    renderDialog();
    await submit();

    expect(screen.getByText(/E-mail ou senha incorretos\. Se você criou a conta com o Google/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Esqueci a senha" })).toBeTruthy();
    expect(invokeEdge).not.toHaveBeenCalled();
  });

  it("limite de tentativas", async () => {
    signIn.mockResolvedValue({ error: Object.assign(new Error("rate"), { code: "over_request_rate_limit" }) });
    renderDialog();
    await submit();
    expect(screen.getByText("Muitas tentativas. Aguarde um minuto e tente de novo.")).toBeTruthy();
  });

  it("erro desconhecido não vaza a mensagem crua", async () => {
    signIn.mockResolvedValue({ error: new Error("Database error querying schema") });
    renderDialog();
    await submit();
    expect(screen.getByText("Não foi possível entrar agora. Tente de novo em instantes.")).toBeTruthy();
    expect(screen.queryByText(/Database error/)).toBeNull();
  });
});

describe("AuthDialog — e-mail não confirmado", () => {
  afterEach(() => vi.useRealTimers());

  it("mostra o aviso em pt-BR e reenvia com contagem de 60 s", async () => {
    signIn.mockResolvedValue({ error: Object.assign(new Error("Email not confirmed"), { code: "email_not_confirmed" }) });
    resendConfirmation.mockResolvedValue({ error: null });
    renderDialog();
    await submit();

    expect(screen.getByText("Seu e-mail ainda não foi confirmado. Enviamos um link para cliente@exemplo.com.")).toBeTruthy();
    expect(screen.queryByText(/Email not confirmed/)).toBeNull();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reenviar e-mail" }));
    });

    expect(resendConfirmation).toHaveBeenCalledWith("cliente@exemplo.com");
    expect(toast.success).toHaveBeenCalledWith("E-mail reenviado. Confira também o spam.");
    const botao = screen.getByRole("button", { name: /Reenviar e-mail \(60s\)/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);

    // um tick por vez: cada segundo só reagenda o próximo timer depois do re-render
    for (let i = 0; i < 60; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect((screen.getByRole("button", { name: "Reenviar e-mail" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("429 no reenvio avisa para aguardar um minuto", async () => {
    signIn.mockResolvedValue({ error: Object.assign(new Error("Email not confirmed"), { code: "email_not_confirmed" }) });
    resendConfirmation.mockResolvedValue({ error: Object.assign(new Error("x"), { status: 429 }) });
    renderDialog();
    await submit();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reenviar e-mail" }));
    });
    expect(toast.error).toHaveBeenCalledWith("Aguarde um minuto para pedir de novo.");
  });
});

describe("AuthDialog — cadastro", () => {
  it("cadastro OK não fecha: mostra 'Confirme seu e-mail' e 'Já confirmei, entrar' volta ao login", async () => {
    signUp.mockResolvedValue({ error: null });
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange, "signup");
    await submit({ name: "Ana Souza" });

    expect(screen.getByText("Confirme seu e-mail")).toBeTruthy();
    expect(screen.getByText("Enviamos um link para cliente@exemplo.com. Abra o e-mail para ativar sua conta.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Reenviar e-mail/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Já confirmei, entrar" }));
    expect(screen.getByText("Entrar na Jilo")).toBeTruthy();
    expect(emailInput().value).toBe("cliente@exemplo.com");
  });

  it("e-mail já cadastrado: mensagem fixa e troca para o modo login", async () => {
    signUp.mockResolvedValue({ error: new Error("email_already_registered") });
    renderDialog(vi.fn(), "signup");
    await submit({ name: "Ana Souza" });

    expect(screen.getByText(/Este e-mail já tem cadastro\. Entre com sua senha ou com o Google/)).toBeTruthy();
    expect(screen.getByText("Entrar na Jilo")).toBeTruthy();
    expect(invokeEdge).not.toHaveBeenCalled();
  });
});
