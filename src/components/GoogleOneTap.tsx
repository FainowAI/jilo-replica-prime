import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { promptGoogleOneTap, cancelGoogleOneTap } from "@/lib/googleAuth";

const ONE_TAP_SESSION_KEY = "jilo_one_tap_shown";
const PROMPT_DELAY_MS = 5000;

/**
 * Google One Tap — captação passiva no canto superior direito (FedCM).
 * Dispara 1x por sessão, ~5s após mount, só para visitantes não logados.
 * Convive com o GoogleLoginPopup central (mesmo fluxo signInWithIdToken via
 * @/lib/googleAuth). Sem UI própria.
 */
export const GoogleOneTap = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (user || sessionStorage.getItem(ONE_TAP_SESSION_KEY)) return;

    const timer = setTimeout(() => {
      promptGoogleOneTap();
      sessionStorage.setItem(ONE_TAP_SESSION_KEY, "1");
    }, PROMPT_DELAY_MS);

    return () => {
      clearTimeout(timer);
      cancelGoogleOneTap();
    };
  }, [user]);

  return null;
};

export default GoogleOneTap;
