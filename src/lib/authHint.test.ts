import { describe, it, expect } from "vitest";
import { authNotice } from "./authHint";

describe("authNotice", () => {
  it("login com conta Google sem senha mostra o alerta do Google", () => {
    const n = authNotice("login", "google");
    expect(n.google).toBe(true);
    expect(n.message).toContain("Entrar com Google");
  });
  it("login sem dica mostra erro genérico que cita o Google", () => {
    const n = authNotice("login", null);
    expect(n.google).toBe(false);
    expect(n.message).toContain("E-mail ou senha incorretos");
    expect(n.message).toContain("Entrar com Google");
  });
  it("cadastro de e-mail existente", () => {
    expect(authNotice("signup", "google").google).toBe(true);
    expect(authNotice("signup", null).message).toBe("Este e-mail já tem cadastro. Faça login.");
  });
});
