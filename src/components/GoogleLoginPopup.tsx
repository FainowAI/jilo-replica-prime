import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import GoogleSignInButton from "@/components/GoogleSignInButton";

const POPUP_SESSION_KEY = "jilo_login_popup_shown";
const OPEN_DELAY_MS = 3000;

/**
 * Popup de login centralizado — destaque principal da captação para visitantes
 * não logados. Auto-abre 1x por sessão, ~3s após mount. Convive com o One Tap
 * nativo (canto). Fecha sozinho quando o login efetiva (user muda no AuthContext).
 */
export const GoogleLoginPopup = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user) {
      setOpen(false);
      return;
    }
    if (sessionStorage.getItem(POPUP_SESSION_KEY)) return;
    const timer = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem(POPUP_SESSION_KEY, "1");
    }, OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [user]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md bg-white text-center">
        <DialogHeader>
          <DialogTitle className="font-['DM_Serif_Display'] text-2xl text-[#1a1a1a] text-center">
            Bem-vinda(o) à Jilo
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-[#6b6b6b] font-sans mt-1">
          Entre para acompanhar seus pedidos e salvar seus endereços.
        </p>

        <div className="flex justify-center mt-5">
          <GoogleSignInButton text="continue_with" />
        </div>

        <div className="text-center text-sm text-[#9b9b9b] font-sans mt-5">
          Prefere e-mail?{" "}
          <Link
            to="/login"
            onClick={() => setOpen(false)}
            className="text-[#1e3a1e] font-semibold hover:underline"
          >
            Entrar com e-mail
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GoogleLoginPopup;
