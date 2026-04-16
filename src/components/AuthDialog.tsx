import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

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
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await signIn(email, password);
        if (error) {
          toast.error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos" : error.message);
        } else {
          toast.success("Bem-vinda(o) de volta!");
          onOpenChange(false);
        }
      } else {
        if (password.length < 6) {
          toast.error("A senha precisa ter no mínimo 6 caracteres");
          setLoading(false);
          return;
        }
        const { error } = await signUp(email, password, fullName);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Conta criada! Verifique seu e-mail para confirmar.");
          onOpenChange(false);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="font-['DM_Serif_Display'] text-2xl text-[#1a1a1a]">
            {mode === "login" ? "Entrar na Jilo" : "Criar conta"}
          </DialogTitle>
        </DialogHeader>

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
        </form>

        <div className="text-center text-sm text-[#9b9b9b] font-sans mt-4">
          {mode === "login" ? (
            <>
              Não tem conta?{" "}
              <button onClick={() => setMode("signup")} className="text-[#1e3a1e] font-semibold hover:underline">
                Cadastre-se
              </button>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <button onClick={() => setMode("login")} className="text-[#1e3a1e] font-semibold hover:underline">
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
