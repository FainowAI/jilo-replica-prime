import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";

const RecuperarSenha = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await resetPassword(email.trim());
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Mensagem neutra: não confirma se o e-mail existe (evita enumeração de contas).
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-[#faf7f2]">
      <AnnouncementBar />
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-md">
        <h1 className="font-['DM_Serif_Display'] text-3xl text-[#1a1a1a] mb-2 text-center">Esqueci a senha</h1>
        <p className="text-sm text-[#9b9b9b] font-sans text-center mb-8">
          Enviamos um link para você criar uma nova senha
        </p>

        {sent ? (
          <div className="bg-white rounded-2xl border border-[#e8e8e4] p-6 text-center space-y-3">
            <MailCheck className="w-10 h-10 text-[#1e3a1e] mx-auto" />
            <p className="text-sm text-[#1a1a1a] font-sans">
              Se existir uma conta com <span className="font-semibold">{email.trim()}</span>, você vai receber um
              e-mail com o link para redefinir a senha.
            </p>
            <p className="text-xs text-[#9b9b9b] font-sans">
              Não chegou? Confira a caixa de spam ou tente novamente em alguns minutos.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-sm text-[#1e3a1e] font-semibold hover:underline"
            >
              Usar outro e-mail
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#e8e8e4] p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar link"}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-[#9b9b9b] font-sans mt-4">
          Lembrou a senha? <Link to="/login" className="text-[#1e3a1e] font-semibold hover:underline">Entrar</Link>
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default RecuperarSenha;
