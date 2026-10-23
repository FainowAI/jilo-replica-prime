export type AuthErrorKind = "credenciais" | "nao_confirmado" | "limite" | "outro";
/** `resendTo`: quando preenchido, a tela oferece "Reenviar e-mail" para esse endereço. */
export type AuthNotice = { message: string; resendTo?: string };

export const EMAIL_ALREADY_REGISTERED = "email_already_registered";

// Mensagens fixas, iguais para todo mundo: não revelam se o e-mail existe nem qual método de login ele usa.
const MSG_CREDENCIAIS =
  "E-mail ou senha incorretos. Se você criou a conta com o Google, use o botão “Entrar com Google”. Se esqueceu a senha, toque em “Esqueci a senha”.";
const MSG_JA_CADASTRADO =
  "Este e-mail já tem cadastro. Entre com sua senha ou com o Google. Se esqueceu a senha, toque em “Esqueci a senha”.";
const MSG_LIMITE = "Muitas tentativas. Aguarde um minuto e tente de novo.";
export const MSG_GENERICA = "Não foi possível entrar agora. Tente de novo em instantes.";

/** Classifica o erro do Supabase Auth (puro). Usa `code`; sem ele, cai para a mensagem em inglês. */
export function authErrorKind(
  error: { code?: string; status?: number; message?: string } | null | undefined,
): AuthErrorKind {
  if (!error) return "outro";
  const { code, status, message } = error;
  if (code === "invalid_credentials" || (!code && message === "Invalid login credentials")) return "credenciais";
  if (code === "email_not_confirmed" || (!code && message === "Email not confirmed")) return "nao_confirmado";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || status === 429) return "limite";
  return "outro";
}

/** Erro de login/cadastro → aviso na tela (nunca a mensagem crua do Supabase). */
export function authNotice(context: "login" | "signup", error: Error, email: string): AuthNotice {
  if (context === "signup" && error.message === EMAIL_ALREADY_REGISTERED) return { message: MSG_JA_CADASTRADO };
  const kind = authErrorKind(error);
  if (kind === "nao_confirmado") {
    return { message: `Seu e-mail ainda não foi confirmado. Enviamos um link para ${email}.`, resendTo: email };
  }
  if (kind === "credenciais") return { message: MSG_CREDENCIAIS };
  if (kind === "limite") return { message: MSG_LIMITE };
  return { message: MSG_GENERICA };
}
