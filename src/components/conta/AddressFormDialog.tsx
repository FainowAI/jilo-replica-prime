import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateAddress, useUpdateAddress } from "@/hooks/useAddresses";
import type { Tables } from "@/integrations/supabase/types";

interface AddressFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address?: Tables<"addresses"> | null;
}

const AddressFormDialog = ({ open, onOpenChange, address }: AddressFormDialogProps) => {
  const [form, setForm] = useState({
    label: "Casa", recipient_name: "", cep: "", street: "", number: "",
    complement: "", neighborhood: "", city: "", state: "SP", is_default: false,
  });

  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();

  useEffect(() => {
    if (address) {
      setForm({
        label: address.label,
        recipient_name: address.recipient_name ?? "",
        cep: address.cep,
        street: address.street,
        number: address.number,
        complement: address.complement ?? "",
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
        is_default: address.is_default,
      });
    } else {
      setForm({ label: "Casa", recipient_name: "", cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "SP", is_default: false });
    }
  }, [address, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validação CEP no formato do DB
    if (!/^[0-9]{5}-?[0-9]{3}$/.test(form.cep)) {
      toast.error("CEP inválido. Use o formato 00000-000");
      return;
    }
    if (form.state.length !== 2) {
      toast.error("UF deve ter 2 caracteres (ex: SP, RJ)");
      return;
    }

    try {
      if (address) {
        await updateAddress.mutateAsync({ id: address.id, update: form });
        toast.success("Endereço atualizado!");
      } else {
        await createAddress.mutateAsync(form);
        toast.success("Endereço adicionado!");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error("Erro ao salvar endereço");
    }
  };

  const isPending = createAddress.isPending || updateAddress.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-['DM_Serif_Display'] text-2xl text-[#1a1a1a]">
            {address ? "Editar endereço" : "Novo endereço"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Etiqueta</label>
              <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required maxLength={50}
                placeholder="Casa, Trabalho..."
                className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Nome do destinatário</label>
              <input type="text" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
                className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">CEP</label>
              <input type="text" value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} required
                placeholder="00000-000"
                className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Rua</label>
              <input type="text" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} required
                className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Número</label>
              <input type="text" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} required
                className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Complemento</label>
              <input type="text" value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })}
                placeholder="Apto, bloco..."
                className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Bairro</label>
            <input type="text" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} required
              className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Cidade</label>
              <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required
                className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">UF</label>
              <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} required maxLength={2}
                className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e] uppercase" />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-2">
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              className="rounded border-[#e8e8e4] text-[#1e3a1e] focus:ring-[#1e3a1e]" />
            <span className="text-sm text-[#1a1a1a] font-sans">Definir como endereço padrão</span>
          </label>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => onOpenChange(false)}
              className="flex-1 h-11 border border-[#e8e8e4] text-[#1a1a1a] rounded-xl font-semibold text-sm font-sans hover:bg-[#f0efeb] transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="flex-1 h-11 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddressFormDialog;
