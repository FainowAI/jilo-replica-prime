import { useEffect, useRef } from "react";
import { renderGoogleButton } from "@/lib/googleAuth";

interface Props {
  text?: "signin_with" | "continue_with" | "signup_with";
  className?: string;
}

/**
 * Botão oficial "Sign in with Google" (renderButton), ligado ao mesmo fluxo
 * signInWithIdToken do One Tap via @/lib/googleAuth. No-op silencioso se
 * VITE_PUBLIC_GOOGLE_CLIENT_ID não estiver setado.
 */
export const GoogleSignInButton = ({ text = "continue_with", className }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) renderGoogleButton(ref.current, text);
  }, [text]);

  return <div ref={ref} className={className} />;
};

export default GoogleSignInButton;
