import { supabase } from "@/integrations/supabase/client";

export type LoginHint = "google" | null;
export type AuthNotice = { google: boolean; message: string };

export const EMAIL_ALREADY_REGISTERED = "email_already_registered";

const GOOGLE_MSG =
  "Este e-mail foi cadastrado com o Google e não tem senha. Toque em “Entrar com Google” para acessar sua conta.";

/** Mapeia a dica do servidor para o aviso na tela (puro, testável). */
export function authNotice(context: "login" | "signup", hint: LoginHint): AuthNotice {
  if (context === "login") {
    if (hint === "google") return { google: true, message: GOOGLE_MSG };
    return {
      google: false,
      message: "E-mail ou senha incorretos. Se você criou a conta com o Google, use o botão “Entrar com Google”.",
    };
  }
  if (hint) return { google: true, message: GOOGLE_MSG };
  return { google: false, message: "Este e-mail já tem cadastro. Faça login." };
}

/** Nunca lança; cai para null após 4s para não travar o loading. */
export async function getLoginHint(email: string): Promise<LoginHint> {
  try {
    const call = supabase.functions
      .invoke("auth-login-hint", { body: { email } })
      .then(({ data }) => (data?.hint === "google" ? ("google" as const) : null));
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
    return await Promise.race([call, timeout]);
  } catch {
    return null;
  }
}
