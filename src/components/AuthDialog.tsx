import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import GoogleHintAlert from "@/components/GoogleHintAlert";
import ResendConfirmation, { ConfirmEmailNotice } from "@/components/ResendConfirmation";
import { authNotice, EMAIL_ALREADY_REGISTERED, type AuthNotice } from "@/lib/authHint";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "login" | "signup";
}

const AuthDialog = ({ open, onOpenChange, initialMode = "login" }: AuthDialogProps) => {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<AuthNotice | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { signIn, signUp, user } = useAuth();

  // Login pelo botão Google (e o próprio login por senha) acontece fora do submit: fecha quando o `user` aparece.
  useEffect(() => {
    if (open && user) onOpenChange(false);
  }, [open, user, onOpenChange]);

  // Quem só renderiza o diálogo deslogado (Header, DeliveryAddressSelector) o desmonta no login, antes do efeito
  // acima rodar: avisa o pai ao desmontar, senão o `open` dele fica true e o diálogo reabre após o logout.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => () => onOpenChangeRef.current(false), []);

  // Fechado, descarta os avisos e a tela "Confirme seu e-mail".
  useEffect(() => {
    if (!open) {
      setAviso(null);
      setSentTo(null);
    }
  }, [open]);

  const trocarModo = (m: "login" | "signup") => {
    setMode(m);
    setAviso(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAviso(null);
    try {
      const mail = email.trim();
      if (mode === "login") {
        const { error } = await signIn(email, password);
        if (error) setAviso(authNotice("login", error, mail));
        else toast.success("Bem-vinda(o) de volta!"); // quem fecha o diálogo é o efeito do `user`
      } else {
        if (password.length < 6) {
          toast.error("A senha precisa ter no mínimo 6 caracteres");
          setLoading(false);
          return;
        }
        const { error } = await signUp(email, password, fullName);
        if (!error) {
          setSentTo(mail); // não fecha: a tela de confirmação evita um 2º cadastro
        } else {
          setAviso(authNotice("signup", error, mail));
          if (error.message === EMAIL_ALREADY_REGISTERED) setMode("login");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="font-['DM_Serif_Display'] text-2xl text-[#1a1a1a]">Confirme seu e-mail</DialogTitle>
          </DialogHeader>
          <ConfirmEmailNotice
            email={sentTo}
            onEnter={() => {
              setSentTo(null);
              setMode("login");
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="font-['DM_Serif_Display'] text-2xl text-[#1a1a1a]">
            {mode === "login" ? "Entrar na Jilo" : "Criar conta"}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          <GoogleHintAlert message={aviso?.message ?? null} />
          {aviso?.resendTo && (
            <div className="-mt-2 mb-4">
              <ResendConfirmation key={aviso.resendTo} email={aviso.resendTo} />
            </div>
          )}
        </div>
        <div className="flex justify-center">
          <GoogleSignInButton text="continue_with" />
        </div>
        <div className="flex items-center gap-3 my-4">
          <span className="h-px flex-1 bg-[#e8e8e4]" />
          <span className="text-xs text-[#9b9b9b] font-sans">ou</span>
          <span className="h-px flex-1 bg-[#e8e8e4]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {mode === "signup" && (
            <div>
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Nome completo</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
          {mode === "login" && (
            <div className="text-center">
              <Link
                to="/recuperar-senha"
                state={{ email: email.trim() }}
                onClick={() => onOpenChange(false)}
                className="text-xs text-[#6b6b6b] font-sans hover:text-[#1e3a1e] hover:underline"
              >
                Esqueci a senha
              </Link>
            </div>
          )}
        </form>

        <div className="text-center text-sm text-[#9b9b9b] font-sans mt-4">
          {mode === "login" ? (
            <>
              Não tem conta?{" "}
              <button onClick={() => trocarModo("signup")} className="text-[#1e3a1e] font-semibold hover:underline">
                Cadastre-se
              </button>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <button onClick={() => trocarModo("login")} className="text-[#1e3a1e] font-semibold hover:underline">
                Entrar
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuthDialog;
