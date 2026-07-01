import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";
import GoogleSignInButton from "@/components/GoogleSignInButton";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") ?? "/conta";

  useEffect(() => {
    if (user) navigate(redirect, { replace: true });
  }, [user, navigate, redirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast.error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos" : error.message);
    } else {
      toast.success("Bem-vinda(o) de volta!");
      navigate(redirect, { replace: true });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#faf7f2]">
      <AnnouncementBar />
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-md">
        <h1 className="font-['DM_Serif_Display'] text-3xl text-[#1a1a1a] mb-2 text-center">Entrar na Jilo</h1>
        <p className="text-sm text-[#9b9b9b] font-sans text-center mb-8">Acesse seus pedidos e endereços</p>

        <div className="flex justify-center mb-4">
          <GoogleSignInButton text="signin_with" />
        </div>
        <div className="flex items-center gap-3 mb-4 max-w-md mx-auto">
          <span className="h-px flex-1 bg-[#e8e8e4]" />
          <span className="text-xs text-[#9b9b9b] font-sans">ou</span>
          <span className="h-px flex-1 bg-[#e8e8e4]" />
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#e8e8e4] p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Senha</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full h-12 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
          </button>
        </form>

        <p className="text-center text-sm text-[#9b9b9b] font-sans mt-4">
          Não tem conta? <Link to="/cadastro" className="text-[#1e3a1e] font-semibold hover:underline">Cadastre-se</Link>
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default Login;
