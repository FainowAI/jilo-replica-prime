import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number;
              locale?: string;
            },
          ) => void;
        };
      };
    };
  }
}

const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** Carrega o script GSI (idempotente) e resolve quando ele estiver pronto. */
const loadGsiScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
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
 * Inicialização única do Google Identity Services por carga de página.
 *
 * ponytail: um único `initialize` + UM nonce compartilhado entre o One Tap
 * (prompt) e todos os botões (renderButton). `initialize` é global/singleton —
 * se cada consumidor inicializasse com nonce próprio, o último venceria e o
 * credential do outro falharia na validação de nonce do Supabase.
 * O SIGNED_IN disparado pelo signInWithIdToken já é tratado no AuthContext
 * (customer-sync + posthog identify).
 */
let readyPromise: Promise<boolean> | null = null;

const ensureGoogleReady = (): Promise<boolean> => {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const clientId = import.meta.env.VITE_PUBLIC_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) return false;
    try {
      await loadGsiScript();
      if (!window.google) return false;

      // Nonce: bruto p/ o signInWithIdToken, hasheado (SHA-256 hex) p/ o Google.
      const rawNonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce));
      const hashedNonce = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      window.google.accounts.id.initialize({
        client_id: clientId,
        nonce: hashedNonce,
        use_fedcm_for_prompt: true,
        callback: async (response) => {
          const { error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: response.credential,
            nonce: rawNonce,
          });
          if (error) {
            console.warn("[googleAuth] signInWithIdToken falhou (fail-soft):", error);
            return;
          }
          analytics.loginEfetuado();
          toast.success("Login efetuado!");
        },
      });
      return true;
    } catch (err) {
      console.warn("[googleAuth] inicialização falhou (fail-soft):", err);
      readyPromise = null; // permite retry numa próxima tentativa
      return false;
    }
  })();
  return readyPromise;
};

/** Dispara o prompt nativo do One Tap (canto sup. direito, controlado pelo FedCM). */
export const promptGoogleOneTap = async () => {
  if (await ensureGoogleReady()) window.google!.accounts.id.prompt();
};

/** Cancela o prompt do One Tap em andamento (cleanup de unmount). */
export const cancelGoogleOneTap = () => window.google?.accounts?.id?.cancel();

type ButtonText = "signin_with" | "continue_with" | "signup_with";

/** Renderiza o botão oficial "Sign in with Google" dentro de `el`. */
export const renderGoogleButton = async (el: HTMLElement, text: ButtonText = "continue_with") => {
  if (!(await ensureGoogleReady())) return;
  el.innerHTML = ""; // evita botão duplicado em re-render / StrictMode
  window.google!.accounts.id.renderButton(el, {
    type: "standard",
    theme: "outline",
    size: "large",
    text,
    shape: "pill",
    logo_alignment: "left",
    width: 320, // ponytail: renderButton exige width numérico (máx 400); 320 cobre o modal/formulários
    locale: "pt-BR",
  });
};
