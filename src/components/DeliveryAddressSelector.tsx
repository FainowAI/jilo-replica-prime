import { useState, useEffect, useMemo } from "react";
import { MapPin, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAddresses } from "@/hooks/useAddresses";
import { isAreaDeliverable, type CepValidationResult } from "@/lib/cepValidator";
import AuthDialog from "@/components/AuthDialog";
import AddressFormDialog from "@/components/conta/AddressFormDialog";
import type { Tables } from "@/integrations/supabase/types";

type Address = Tables<"addresses">;

interface DeliveryAddressSelectorProps {
  /** Chamado quando o endereço selecionado muda (ou é desselecionado). */
  onResult: (result: CepValidationResult | null) => void;
  /** Chamado quando o id do endereço selecionado muda. Usado pelo Carrinho pra cart attribute. */
  onAddressIdChange?: (addressId: string | null) => void;
  className?: string;
}

/**
 * Constrói um CepValidationResult a partir de um endereço cadastrado.
 * Não bate na ViaCEP — todos os campos vêm do banco.
 */
function buildResultFromAddress(address: Address): CepValidationResult {
  const deliverable = isAreaDeliverable(address.state, address.city);
  const logradouro = [
    address.street,
    address.number,
    address.complement,
  ].filter(Boolean).join(", ");

  return {
    isValid: true,
    isDeliverable: deliverable,
    cepInfo: {
      cep: address.cep,
      logradouro,
      bairro: address.neighborhood,
      localidade: address.city,
      uf: address.state,
    },
    message: deliverable
      ? `Entregando em ${address.city}/${address.state}`
      : `Ainda não entregamos em ${address.city}/${address.state}`,
  };
}

const DeliveryAddressSelector = ({
  onResult,
  onAddressIdChange,
  className = "",
}: DeliveryAddressSelectorProps) => {
  const { user } = useAuth();
  const { data: addresses, isLoading, isError, refetch } = useAddresses();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [addressFormOpen, setAddressFormOpen] = useState(false);

  // Ordena: entregáveis primeiro, depois default, depois created_at desc.
  // useAddresses já ordena por is_default + created_at, só precisamos garantir
  // que os não-entregáveis fiquem por último.
  const sortedAddresses = useMemo(() => {
    if (!addresses) return [];
    return [...addresses].sort((a, b) => {
      const aDeliverable = isAreaDeliverable(a.state, a.city);
      const bDeliverable = isAreaDeliverable(b.state, b.city);
      if (aDeliverable !== bDeliverable) return aDeliverable ? -1 : 1;
      // mantém ordem original (default first, created_at desc)
      return 0;
    });
  }, [addresses]);

  // Pré-seleciona o default (primeiro entregável da lista)
  useEffect(() => {
    if (selectedId) return; // já tem seleção, não sobrescrever
    if (!sortedAddresses.length) return;
    const firstDeliverable = sortedAddresses.find((a) =>
      isAreaDeliverable(a.state, a.city)
    );
    if (firstDeliverable) {
      setSelectedId(firstDeliverable.id);
    }
  }, [sortedAddresses, selectedId]);

  // Reporta resultado e id pra cima quando muda seleção
  useEffect(() => {
    if (!selectedId) {
      onResult(null);
      onAddressIdChange?.(null);
      return;
    }
    const selected = sortedAddresses.find((a) => a.id === selectedId);
    if (!selected) {
      onResult(null);
      onAddressIdChange?.(null);
      return;
    }
    onResult(buildResultFromAddress(selected));
    onAddressIdChange?.(selected.id);
  }, [selectedId, sortedAddresses, onResult, onAddressIdChange]);

  // ESTADO 1 — Guest
  if (!user) {
    return (
      <div className={className}>
        <p className="text-sm text-[#9b9b9b] font-sans mb-2">Endereço de entrega</p>
        <div className="bg-[#1e3a1e]/5 border border-[#1e3a1e]/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-[#1e3a1e] mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1a1a1a] font-sans mb-1">
                Faça login para selecionar seu endereço
              </p>
              <p className="text-xs text-[#9b9b9b] font-sans mb-3">
                Suas marmitas vão pra um endereço cadastrado. Seguro e rápido.
              </p>
              <button
                onClick={() => setAuthDialogOpen(true)}
                className="px-4 py-2 bg-[#1e3a1e] text-white rounded-lg text-sm font-bold font-sans hover:bg-[#1e3a1e]/90 transition-colors"
              >
                Entrar ou cadastrar
              </button>
            </div>
          </div>
        </div>

        <AuthDialog
          open={authDialogOpen}
          onOpenChange={setAuthDialogOpen}
          initialMode="signup"
        />
      </div>
    );
  }

  // ESTADO 2 — Logado, carregando
  if (isLoading) {
    return (
      <div className={className}>
        <p className="text-sm text-[#9b9b9b] font-sans mb-2">Endereço de entrega</p>
        <div className="space-y-2">
          <div className="h-20 bg-[#f0efeb] rounded-xl animate-pulse" />
          <div className="h-20 bg-[#f0efeb] rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  // ESTADO 3 — Logado, erro ao carregar
  if (isError) {
    return (
      <div className={className}>
        <p className="text-sm text-[#9b9b9b] font-sans mb-2">Endereço de entrega</p>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800 font-sans mb-1">
                Erro ao carregar seus endereços
              </p>
              <button
                onClick={() => refetch()}
                className="text-xs text-red-700 underline font-sans"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ESTADO 4 — Logado, sem endereços cadastrados
  if (!sortedAddresses.length) {
    return (
      <div className={className}>
        <p className="text-sm text-[#9b9b9b] font-sans mb-2">Endereço de entrega</p>
        <div className="bg-white border border-dashed border-[#e8e8e4] rounded-xl p-4">
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-[#9b9b9b] mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1a1a1a] font-sans mb-1">
                Você ainda não tem endereço cadastrado
              </p>
              <p className="text-xs text-[#9b9b9b] font-sans mb-3">
                Cadastre um endereço para receber suas marmitas.
              </p>
              <button
                onClick={() => setAddressFormOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1e3a1e] text-white rounded-lg text-sm font-bold font-sans hover:bg-[#1e3a1e]/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Cadastrar endereço
              </button>
            </div>
          </div>
        </div>

        <AddressFormDialog
          open={addressFormOpen}
          onOpenChange={setAddressFormOpen}
        />
      </div>
    );
  }

  // ESTADO 5 — Logado, com endereços
  return (
    <div className={className}>
      <p className="text-sm text-[#9b9b9b] font-sans mb-2">Escolha o endereço de entrega</p>
      <div className="space-y-2">
        {sortedAddresses.map((address) => {
          const deliverable = isAreaDeliverable(address.state, address.city);
          const isSelected = selectedId === address.id;

          return (
            <button
              key={address.id}
              type="button"
              onClick={() => deliverable && setSelectedId(address.id)}
              disabled={!deliverable}
              className={`w-full text-left rounded-xl border p-3 transition-colors font-sans ${
                !deliverable
                  ? "opacity-60 cursor-not-allowed bg-[#f0efeb] border-[#e8e8e4]"
                  : isSelected
                    ? "bg-[#1e3a1e]/5 border-[#1e3a1e]"
                    : "bg-white border-[#e8e8e4] hover:border-[#1e3a1e]/40"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Radio visual */}
                <div className="mt-0.5">
                  {!deliverable ? (
                    <AlertCircle className="h-5 w-5 text-[#9b9b9b]" />
                  ) : isSelected ? (
                    <CheckCircle2 className="h-5 w-5 text-[#1e3a1e]" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-[#e8e8e4]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-[#1a1a1a] truncate">
                      {address.label}
                    </p>
                    {address.is_default && (
                      <span className="text-[10px] bg-[#1e3a1e] text-white px-1.5 py-0.5 rounded font-bold">
                        Padrão
                      </span>
                    )}
                    {!deliverable && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                        Não entregamos aqui
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#6b6b6b] truncate">
                    {address.street}, {address.number}
                    {address.complement ? `, ${address.complement}` : ""}
                  </p>
                  <p className="text-xs text-[#9b9b9b] truncate">
                    {address.neighborhood} — {address.city}/{address.state} • CEP {address.cep}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setAddressFormOpen(true)}
        className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 border border-dashed border-[#e8e8e4] text-[#1a1a1a] rounded-xl text-sm font-semibold font-sans hover:border-[#1e3a1e] hover:text-[#1e3a1e] transition-colors"
      >
        <Plus className="h-4 w-4" />
        Cadastrar novo endereço
      </button>

      <AddressFormDialog
        open={addressFormOpen}
        onOpenChange={setAddressFormOpen}
      />
    </div>
  );
};

export default DeliveryAddressSelector;
