import { useState } from "react";
import { Plus, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useAddresses, useDeleteAddress, useUpdateAddress } from "@/hooks/useAddresses";
import AddressCard from "@/components/conta/AddressCard";
import AddressFormDialog from "@/components/conta/AddressFormDialog";
import type { Tables } from "@/integrations/supabase/types";

const Enderecos = () => {
  const { data: addresses, isLoading } = useAddresses();
  const deleteAddress = useDeleteAddress();
  const updateAddress = useUpdateAddress();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Tables<"addresses"> | null>(null);

  const handleEdit = (address: Tables<"addresses">) => {
    setEditingAddress(address);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingAddress(null);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este endereço?")) return;
    try {
      await deleteAddress.mutateAsync(id);
      toast.success("Endereço removido");
    } catch {
      toast.error("Erro ao remover endereço");
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await updateAddress.mutateAsync({ id, update: { is_default: true } });
      toast.success("Endereço padrão atualizado");
    } catch {
      toast.error("Erro ao atualizar");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-['DM_Serif_Display'] text-xl text-[#1a1a1a]">Endereços</h2>
          <p className="text-sm text-[#9b9b9b] font-sans">Gerencie seus endereços de entrega</p>
        </div>
        <button onClick={handleNew}
          className="h-10 px-4 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors flex items-center gap-2">
          <Plus className="h-4 w-4" /> Novo endereço
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-[#e8e8e4] p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#1e3a1e]" />
        </div>
      ) : !addresses?.length ? (
        <div className="bg-white rounded-2xl border border-[#e8e8e4] p-12 text-center">
          <MapPin className="h-10 w-10 text-[#9b9b9b] mx-auto mb-3" />
          <p className="text-sm text-[#9b9b9b] font-sans mb-4">Você ainda não cadastrou nenhum endereço</p>
          <button onClick={handleNew}
            className="h-10 px-4 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Adicionar endereço
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <AddressCard
              key={addr.id}
              address={addr}
              onEdit={() => handleEdit(addr)}
              onDelete={() => handleDelete(addr.id)}
              onSetDefault={() => handleSetDefault(addr.id)}
            />
          ))}
        </div>
      )}

      <AddressFormDialog open={dialogOpen} onOpenChange={setDialogOpen} address={editingAddress} />
    </div>
  );
};

export default Enderecos;
