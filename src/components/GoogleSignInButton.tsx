import { useEffect, useRef, useState } from "react";
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
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    setUnavailable(false);
    if (ref.current) {
      void renderGoogleButton(ref.current, text).then((rendered) => {
        if (mounted && !rendered) setUnavailable(true);
      });
    }
    return () => {
      mounted = false;
    };
  }, [text]);

  return (
    <div ref={ref} className={className}>
      {unavailable && (
        <span role="status" className="text-sm text-[#6b6b6b]">
          Login com Google indisponível. Use seu e-mail.
        </span>
      )}
    </div>
  );
};

export default GoogleSignInButton;
