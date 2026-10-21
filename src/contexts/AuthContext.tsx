import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { identifyUser, resetAnalytics } from "@/analytics/posthog";
import { analytics } from "@/analytics/events";
import { EMAIL_ALREADY_REGISTERED, authErrorKind } from "@/lib/authHint";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  resendConfirmation: (email: string) => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      // PostHog (B.2.1): identifica na restauração de sessão (distinct_id = user.id).
      if (session?.user) identifyUser(session.user.id);
    });

    // Escuta mudanças
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Sprint A (EAP visibilidade de dados — A.1.2): dispara o customer-sync no
      // signup E no login. Idempotente por shopify_customer_id (a edge retorna
      // "already_synced" se o customer já existe). Deferido com setTimeout p/ não
      // rodar chamada async dentro do callback do onAuthStateChange (evita deadlock
      // conhecido do supabase-js). Fail-soft: erro nunca impacta a UX.
      // PostHog (Sprint B / B.2.1 — EAP Seção 6): identify no SIGNED_IN (distinct_id
      // = user.id, sem PII) e reset no SIGNED_OUT. Convive com o customer-sync (Sprint A).
      if (event === "SIGNED_IN") {
        if (session?.user) identifyUser(session.user.id);
        setTimeout(() => {
          supabase.functions
            .invoke("shopify-customer-sync")
            .catch((err) => console.warn("[customer-sync] dispatch falhou (não bloqueia UX):", err));
        }, 0);
      } else if (event === "SIGNED_OUT") {
        resetAnalytics();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // B.2.2 — sem PII: só o método e o motivo normalizado (nunca e-mail nem mensagem crua).
    if (error) analytics.loginFalhou({ metodo: "senha", motivo: authErrorKind(error) });
    else analytics.loginEfetuado({ metodo: "senha" });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: fullName ? { full_name: fullName } : undefined,
        emailRedirectTo: `${window.location.origin}/conta`,
      },
    });
    // E-mail já cadastrado: o Supabase não dá erro, devolve user com identities vazio.
    if (!error && data.user && data.user.identities?.length === 0) {
      return { error: new Error(EMAIL_ALREADY_REGISTERED) };
    }
    if (!error) analytics.cadastroConcluido({ metodo: "senha" }); // B.2.2 — sem PII
    return { error };
  };

  // Reenvia o e-mail de confirmação do cadastro (o link leva a /conta).
  const resendConfirmation = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/conta` },
    });
    return { error };
  };

  // Envia o e-mail de redefinição de senha. O link leva o cliente de volta
  // para /redefinir-senha, onde o supabase-js detecta a sessão de recuperação
  // (evento PASSWORD_RECOVERY) e permite gravar a nova senha.
  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    return { error };
  };

  // Grava a nova senha. Exige uma sessão válida (de recuperação ou normal),
  // que o supabase-js já estabelece a partir do link do e-mail.
  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, resendConfirmation, resetPassword, updatePassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
};
