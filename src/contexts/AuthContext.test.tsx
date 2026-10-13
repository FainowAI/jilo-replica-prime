import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";

// --- Mock do cliente Supabase ---
// vi.hoisted: as fns precisam existir antes do factory do vi.mock (que é içado ao topo).
const {
  resetPasswordForEmail,
  updateUser,
  getSession,
  onAuthStateChange,
  signInWithPassword,
  signUp,
  signOut,
  resend,
} = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
  signUp: vi.fn().mockResolvedValue({ error: null }),
  signOut: vi.fn().mockResolvedValue({ error: null }),
  resend: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail,
      updateUser,
      getSession,
      onAuthStateChange,
      signInWithPassword,
      signUp,
      signOut,
      resend,
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

// Analytics é fire-and-forget; não deve interferir nos testes.
vi.mock("@/analytics/posthog", () => ({ identifyUser: vi.fn(), resetAnalytics: vi.fn() }));
vi.mock("@/analytics/events", () => ({
  analytics: { loginEfetuado: vi.fn(), loginFalhou: vi.fn(), cadastroConcluido: vi.fn() },
}));

import { analytics } from "@/analytics/events";
import { EMAIL_ALREADY_REGISTERED } from "@/lib/authHint";
import { AuthProvider, useAuth } from "./AuthContext";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe("AuthContext — redefinição de senha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: null } });
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it("resetPassword chama resetPasswordForEmail com o redirect para /redefinir-senha", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });

    let res: { error: Error | null } | undefined;
    await act(async () => {
      res = await result.current.resetPassword("cliente@exemplo.com");
    });

    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "cliente@exemplo.com",
      expect.objectContaining({ redirectTo: expect.stringContaining("/redefinir-senha") }),
    );
    expect(res?.error).toBeNull();
  });

  it("resetPassword repassa o erro do Supabase", async () => {
    const err = new Error("rate limit");
    resetPasswordForEmail.mockResolvedValue({ error: err });
    const { result } = renderHook(() => useAuth(), { wrapper });

    let res: { error: Error | null } | undefined;
    await act(async () => {
      res = await result.current.resetPassword("cliente@exemplo.com");
    });

    expect(res?.error).toBe(err);
  });

  it("updatePassword chama updateUser com a nova senha", async () => {
    updateUser.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });

    let res: { error: Error | null } | undefined;
    await act(async () => {
      res = await result.current.updatePassword("novaSenha123");
    });

    expect(updateUser).toHaveBeenCalledWith({ password: "novaSenha123" });
    expect(res?.error).toBeNull();
  });

  it("updatePassword repassa o erro do Supabase", async () => {
    const err = new Error("session expired");
    updateUser.mockResolvedValue({ error: err });
    const { result } = renderHook(() => useAuth(), { wrapper });

    let res: { error: Error | null } | undefined;
    await act(async () => {
      res = await result.current.updatePassword("novaSenha123");
    });

    expect(res?.error).toBe(err);
  });
});

describe("AuthContext — login, cadastro e reenvio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: null } });
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it("signIn com sucesso registra login por senha", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.signIn("a@b.com", "123456");
    });
    expect(analytics.loginEfetuado).toHaveBeenCalledWith({ metodo: "senha" });
    expect(analytics.loginFalhou).not.toHaveBeenCalled();
  });

  it("signIn com erro registra só o motivo normalizado (sem e-mail nem mensagem)", async () => {
    const err = Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" });
    signInWithPassword.mockResolvedValue({ error: err });
    const { result } = renderHook(() => useAuth(), { wrapper });
    let res: { error: Error | null } | undefined;
    await act(async () => {
      res = await result.current.signIn("a@b.com", "errada");
    });
    expect(res?.error).toBe(err);
    expect(analytics.loginFalhou).toHaveBeenCalledWith({ metodo: "senha", motivo: "credenciais" });
    expect(analytics.loginEfetuado).not.toHaveBeenCalled();
  });

  it("signUp de e-mail já cadastrado (identities vazio) devolve EMAIL_ALREADY_REGISTERED", async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [] } }, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    let res: { error: Error | null } | undefined;
    await act(async () => {
      res = await result.current.signUp("a@b.com", "123456", "Ana");
    });
    expect(res?.error?.message).toBe(EMAIL_ALREADY_REGISTERED);
    expect(analytics.cadastroConcluido).not.toHaveBeenCalled();
  });

  it("signUp novo registra cadastro por senha", async () => {
    signUp.mockResolvedValue({ data: { user: { identities: [{}] } }, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.signUp("a@b.com", "123456", "Ana");
    });
    expect(analytics.cadastroConcluido).toHaveBeenCalledWith({ metodo: "senha" });
  });

  it("resendConfirmation chama auth.resend (signup) com o redirect para /conta", async () => {
    resend.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    let res: { error: Error | null } | undefined;
    await act(async () => {
      res = await result.current.resendConfirmation("a@b.com");
    });
    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "a@b.com",
      options: { emailRedirectTo: expect.stringContaining("/conta") },
    });
    expect(res?.error).toBeNull();
  });
});
