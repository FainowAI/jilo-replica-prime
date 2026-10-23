import { describe, it, expect } from "vitest";
import { authErrorKind, authNotice, EMAIL_ALREADY_REGISTERED, MSG_GENERICA } from "./authHint";

describe("authErrorKind", () => {
  it("classifica pelo code do AuthError", () => {
    expect(authErrorKind({ code: "invalid_credentials", message: "x" })).toBe("credenciais");
    expect(authErrorKind({ code: "email_not_confirmed", message: "x" })).toBe("nao_confirmado");
    expect(authErrorKind({ code: "over_email_send_rate_limit", message: "x" })).toBe("limite");
    expect(authErrorKind({ code: "over_request_rate_limit", message: "x" })).toBe("limite");
    expect(authErrorKind({ code: "weak_password", message: "x" })).toBe("outro");
  });
  it("429 sem code é limite", () => {
    expect(authErrorKind({ status: 429, message: "Too many" })).toBe("limite");
  });
  it("sem code, cai para a mensagem em inglês", () => {
    expect(authErrorKind(new Error("Invalid login credentials"))).toBe("credenciais");
    expect(authErrorKind(new Error("Email not confirmed"))).toBe("nao_confirmado");
    expect(authErrorKind(new Error("boom"))).toBe("outro");
    expect(authErrorKind(null)).toBe("outro");
  });
});

describe("authNotice", () => {
  const e = (message: string, code?: string) => Object.assign(new Error(message), { code });

  it("senha incorreta: mensagem fixa que cita Google e esqueci a senha", () => {
    const n = authNotice("login", e("Invalid login credentials", "invalid_credentials"), "a@b.com");
    expect(n.message).toContain("E-mail ou senha incorretos");
    expect(n.message).toContain("Entrar com Google");
    expect(n.message).toContain("Esqueci a senha");
    expect(n.resendTo).toBeUndefined();
  });
  it("e-mail não confirmado: cita o e-mail e oferece reenviar", () => {
    const n = authNotice("login", e("Email not confirmed", "email_not_confirmed"), "a@b.com");
    expect(n).toEqual({
      message: "Seu e-mail ainda não foi confirmado. Enviamos um link para a@b.com.",
      resendTo: "a@b.com",
    });
  });
  it("limite", () => {
    expect(authNotice("login", e("x", "over_email_send_rate_limit"), "a@b.com").message).toBe(
      "Muitas tentativas. Aguarde um minuto e tente de novo.",
    );
  });
  it("cadastro de e-mail existente: mensagem fixa", () => {
    const n = authNotice("signup", new Error(EMAIL_ALREADY_REGISTERED), "a@b.com");
    expect(n.message).toContain("Este e-mail já tem cadastro");
    expect(n.message).toContain("Esqueci a senha");
  });
  it("outro erro: genérico, nunca a mensagem crua", () => {
    expect(authNotice("login", e("Database error saving new user"), "a@b.com").message).toBe(MSG_GENERICA);
  });
});
