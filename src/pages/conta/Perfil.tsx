import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { useAuth } from "@/contexts/AuthContext";

const Perfil = () => {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setCpf(profile.cpf ?? "");
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile.mutateAsync({
        full_name: fullName || null,
        phone: phone || null,
        cpf: cpf || null,
      });
      toast.success("Perfil atualizado!");
    } catch (err) {
      toast.error("Erro ao atualizar perfil");
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8e4] p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#1e3a1e]" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e8e8e4] p-6">
      <h2 className="font-['DM_Serif_Display'] text-xl text-[#1a1a1a] mb-1">Informações pessoais</h2>
      <p className="text-sm text-[#9b9b9b] font-sans mb-6">Essas informações são usadas em seus pedidos</p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
        <div>
          <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">E-mail</label>
          <input type="email" value={user?.email ?? ""} disabled
            className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans bg-[#f0efeb] text-[#9b9b9b]" />
          <p className="text-[11px] text-[#9b9b9b] font-sans mt-1">O e-mail não pode ser alterado</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Nome completo</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Telefone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">CPF</label>
            <input type="text" value={cpf} onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              className="w-full px-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
          </div>
        </div>

        <button type="submit" disabled={updateProfile.isPending}
          className="h-11 px-6 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 flex items-center gap-2">
          {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar alterações"}
        </button>
      </form>
    </div>
  );
};

export default Perfil;
