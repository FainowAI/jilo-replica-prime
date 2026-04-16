import { MapPin, Pencil, Trash2, Check, Star } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface AddressCardProps {
  address: Tables<"addresses">;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}

const AddressCard = ({ address, onEdit, onDelete, onSetDefault }: AddressCardProps) => {
  return (
    <div className={`bg-white rounded-2xl border p-5 ${address.is_default ? "border-[#1e3a1e]" : "border-[#e8e8e4]"}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#1e3a1e]" />
          <h3 className="font-semibold text-[#1a1a1a] font-sans text-sm">{address.label}</h3>
          {address.is_default && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#1e3a1e] text-white text-[10px] font-bold rounded-full">
              <Star className="h-2.5 w-2.5" /> Padrão
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-1.5 text-[#9b9b9b] hover:text-[#1a1a1a] hover:bg-[#f0efeb] rounded transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-[#9b9b9b] hover:text-red-500 hover:bg-red-50 rounded transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="text-sm text-[#1a1a1a] font-sans space-y-0.5">
        {address.recipient_name && <p className="font-medium">{address.recipient_name}</p>}
        <p>{address.street}, {address.number}{address.complement ? ` — ${address.complement}` : ""}</p>
        <p className="text-[#9b9b9b]">{address.neighborhood}, {address.city} — {address.state}</p>
        <p className="text-[#9b9b9b]">CEP {address.cep}</p>
      </div>

      {!address.is_default && (
        <button onClick={onSetDefault} className="mt-3 text-xs font-semibold text-[#1e3a1e] hover:underline flex items-center gap-1">
          <Check className="h-3 w-3" /> Tornar padrão
        </button>
      )}
    </div>
  );
};

export default AddressCard;
