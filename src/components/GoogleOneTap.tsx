import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { analytics } from "@/analytics/events";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            nonce: string;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          prompt: () => void;
          cancel: () => void;
        };
      };
    };
  }
}

const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const ONE_TAP_SESSION_KEY = "jilo_one_tap_shown";
const PROMPT_DELAY_MS = 5000;

/** Carrega o script GSI (idempotente) e resolve quando ele estiver pronto. */
const loadGsiScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar script GSI")));
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar script GSI"));
    document.head.appendChild(script);
  });

/**
 * Google One Tap — captação passiva de login para visitantes não logados.
 * Sem UI própria (popup nativo do Google). Dispara 1x por sessão, ~5s após mount.
 * O SIGNED_IN disparado pelo signInWithIdToken já é tratado no AuthContext
 * (customer-sync + posthog identify) — este componente só inicia o fluxo.
 */
export const GoogleOneTap = () => {
  const { user } = useAuth();

  useEffect(() => {
    const clientId = import.meta.env.VITE_PUBLIC_GOOGLE_CLIENT_ID as string | undefined;
    if (user || !clientId || sessionStorage.getItem(ONE_TAP_SESSION_KEY)) return;

    let cancelled = false;
    let nonce = "";

    const handleCredential = async (response: { credential: string }) => {
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
        nonce,
      });
      if (error) {
        console.warn("[GoogleOneTap] signInWithIdToken falhou (fail-soft):", error);
        return;
      }
      analytics.loginEfetuado();
      toast.success("Login efetuado!");
    };

    const timer = setTimeout(async () => {
      try {
        await loadGsiScript();
        if (cancelled || !window.google) return;

        nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
        const enc = new TextEncoder().encode(nonce);
        const hashBuffer = await crypto.subtle.digest("SHA-256", enc);
        const hashedNonce = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredential,
          nonce: hashedNonce,
          use_fedcm_for_prompt: true,
        });
        window.google.accounts.id.prompt();
        sessionStorage.setItem(ONE_TAP_SESSION_KEY, "1");
      } catch (err) {
        console.warn("[GoogleOneTap] inicialização falhou (fail-soft):", err);
      }
    }, PROMPT_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.google?.accounts?.id?.cancel();
    };
  }, [user]);

  return null;
};

export default GoogleOneTap;
