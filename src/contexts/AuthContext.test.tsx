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
} = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
  signUp: vi.fn().mockResolvedValue({ error: null }),
  signOut: vi.fn().mockResolvedValue({ error: null }),
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
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

// Analytics é fire-and-forget; não deve interferir nos testes.
vi.mock("@/analytics/posthog", () => ({ identifyUser: vi.fn(), resetAnalytics: vi.fn() }));
vi.mock("@/analytics/events", () => ({
  analytics: { loginEfetuado: vi.fn(), cadastroConcluido: vi.fn() },
}));

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
