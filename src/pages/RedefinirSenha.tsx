import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";

type Status = "verifying" | "ready" | "invalid" | "saving" | "done";

const RedefinirSenha = () => {
  const [status, setStatus] = useState<Status>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { updatePassword } = useAuth();
  const navigate = useNavigate();

  // Detecta a sessão de recuperação criada a partir do link do e-mail.
  // supabase-js (detectSessionInUrl) resolve tanto o fluxo implicit (#access_token
  // no hash) quanto o PKCE (?code= na query). Confirmamos por três caminhos para
  // não depender de corrida de evento: sessão já existente, evento PASSWORD_RECOVERY
  // e troca manual do code como fallback.
  useEffect(() => {
    let active = true;

    const markReady = () => {
      if (active) setStatus("ready");
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) markReady();
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        markReady();
        return;
      }

      // Fallback PKCE: se o link trouxe ?code= e a sessão ainda não apareceu,
      // troca o código por uma sessão manualmente.
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (active && !error) {
          markReady();
          return;
        }
      }

      // Se em alguns segundos nenhuma sessão de recuperação apareceu, o link é
      // inválido ou expirou.
      setTimeout(async () => {
        if (!active) return;
        const { data: again } = await supabase.auth.getSession();
        setStatus((s) => (s === "ready" || again.session ? "ready" : "invalid"));
      }, 3000);
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha precisa ter no mínimo 6 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    setStatus("saving");
    const { error } = await updatePassword(password);
    if (error) {
      toast.error(error.message);
      setStatus("ready");
      return;
    }
    setStatus("done");
    toast.success("Senha redefinida com sucesso!");
    setTimeout(() => navigate("/conta", { replace: true }), 1200);
  };

  return (
    <div className="min-h-screen bg-[#faf7f2]">
      <AnnouncementBar />
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-md">
        <h1 className="font-['DM_Serif_Display'] text-3xl text-[#1a1a1a] mb-2 text-center">Nova senha</h1>
        <p className="text-sm text-[#9b9b9b] font-sans text-center mb-8">Escolha uma nova senha para sua conta</p>

        {status === "verifying" && (
          <div className="bg-white rounded-2xl border border-[#e8e8e4] p-6 flex items-center justify-center gap-2 text-sm text-[#6b6b6b] font-sans">
            <Loader2 className="w-4 h-4 animate-spin" /> Validando o link...
          </div>
        )}

        {status === "invalid" && (
          <div className="bg-white rounded-2xl border border-[#e8e8e4] p-6 text-center space-y-3">
            <p className="text-sm text-[#1a1a1a] font-sans">
              Este link de redefinição é inválido ou expirou.
            </p>
            <Link
              to="/recuperar-senha"
              className="inline-block text-sm text-[#1e3a1e] font-semibold hover:underline"
            >
              Pedir um novo link
            </Link>
          </div>
        )}

        {(status === "ready" || status === "saving" || status === "done") && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#e8e8e4] p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Nova senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                disabled={status !== "ready"}
                className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e] disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Confirmar nova senha</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                disabled={status !== "ready"}
                className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e] disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={status !== "ready"}
              className="w-full h-12 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {status === "saving" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : status === "done" ? (
                "Senha alterada!"
              ) : (
                "Salvar nova senha"
              )}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-[#9b9b9b] font-sans mt-4">
          <Link to="/login" className="text-[#1e3a1e] font-semibold hover:underline">Voltar para o login</Link>
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default RedefinirSenha;
