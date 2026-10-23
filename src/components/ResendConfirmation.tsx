import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { authErrorKind, MSG_GENERICA } from "@/lib/authHint";

// O Supabase só aceita um novo e-mail de confirmação por endereço a cada 60 s.
const COOLDOWN_S = 60;

interface ResendProps {
  email: string;
  /** Já começa bloqueado: o cadastro acabou de enviar um e-mail. */
  startCooldown?: boolean;
}

/** Botão "Reenviar e-mail" com contagem regressiva de 60 s depois de cada envio. */
const ResendConfirmation = ({ email, startCooldown }: ResendProps) => {
  const { resendConfirmation } = useAuth();
  const [seconds, setSeconds] = useState(startCooldown ? COOLDOWN_S : 0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const resend = async () => {
    setSending(true);
    const { error } = await resendConfirmation(email);
    setSending(false);
    const limite = !!error && authErrorKind(error) === "limite";
    if (error && !limite) {
      toast.error(MSG_GENERICA);
      return;
    }
    if (limite) toast.error("Aguarde um minuto para pedir de novo.");
    else toast.success("E-mail reenviado. Confira também o spam.");
    setSeconds(COOLDOWN_S); // no limite o Supabase já está contando os 60 s dele
  };

  return (
    <button
      type="button"
      onClick={resend}
      disabled={sending || seconds > 0}
      className="w-full h-11 border border-[#1e3a1e] text-[#1e3a1e] rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : seconds > 0 ? `Reenviar e-mail (${seconds}s)` : "Reenviar e-mail"}
    </button>
  );
};

/** Tela "Confirme seu e-mail" exibida depois do cadastro (o título fica por conta de quem usa). */
export const ConfirmEmailNotice = ({ email, onEnter }: { email: string; onEnter: () => void }) => (
  <div className="space-y-4 mt-2">
    <p className="ph-no-capture text-sm text-[#6b6b6b] font-sans">
      Enviamos um link para {email}. Abra o e-mail para ativar sua conta.
    </p>
    <ResendConfirmation email={email} startCooldown />
    <button
      type="button"
      onClick={onEnter}
      className="w-full h-12 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors"
    >
      Já confirmei, entrar
    </button>
  </div>
);

export default ResendConfirmation;
