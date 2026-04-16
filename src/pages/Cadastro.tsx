import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";

const Cadastro = () => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signUp, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/conta", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha precisa ter no mínimo 6 caracteres");
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password, fullName);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      navigate("/login?redirect=/conta", { replace: true });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#faf7f2]">
      <AnnouncementBar />
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-md">
        <h1 className="font-['DM_Serif_Display'] text-3xl text-[#1a1a1a] mb-2 text-center">Criar conta</h1>
        <p className="text-sm text-[#9b9b9b] font-sans text-center mb-8">Acompanhe seus pedidos e salve seus endereços</p>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#e8e8e4] p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Nome completo</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required
              className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Senha</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
              className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full h-12 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar conta"}
          </button>
        </form>

        <p className="text-center text-sm text-[#9b9b9b] font-sans mt-4">
          Já tem conta? <Link to="/login" className="text-[#1e3a1e] font-semibold hover:underline">Entrar</Link>
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default Cadastro;
