import { useState, useEffect, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { useProfile } from "@/hooks/useProfile";
import CardExpiryFields from "@/components/CardExpiryFields";
import { composeExpiry } from "@/lib/alelo/expiry";
import { luhnValid, isValidCpf, formatCardNumber, formatCpf, onlyDigits } from "@/lib/vr/card";
import { payWithVr, VrCheckoutError, type VrCheckoutInput } from "@/lib/vr/client";

interface VrCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkout: VrCheckoutInput;
}

const EMPTY_FORM = { nome: "", numero: "", mes: "", ano: "", cvv: "", cpf: "" };

/** Mês/ano (mesma regra do Alelo: vencido ou inválido → null) → "AAMM" que a VR espera. */
const toAAMM = (mes: string, ano: string): string | null => {
  const mmAaaa = composeExpiry(mes, ano);
  return mmAaaa ? `${mmAaaa.slice(5, 7)}${mmAaaa.slice(0, 2)}` : null;
};

const VrCardDialog = ({ open, onOpenChange, checkout }: VrCardDialogProps) => {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pré-preenche CPF do perfil apenas quando o diálogo abre com o campo vazio.
  // ponytail: não grava de volta no perfil — o CPF aqui é do titular do cartão, pode ser outra pessoa (M4).
  useEffect(() => {
    if (open && profile?.cpf && !form.cpf) {
      setForm((f) => ({ ...f, cpf: formatCpf(profile.cpf!) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile?.cpf]);

  const reset = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setSubmitting(false);
  };

  const handleClose = (nextOpen: boolean) => {
    // Cobrança em voo: não deixa fechar (ESC/clique fora) — o resultado se perderia.
    if (!nextOpen && submitting) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const validate = (): string | null => {
    if (!form.nome.trim()) return "Informe o nome impresso no cartão.";
    const numDigits = onlyDigits(form.numero);
    if (numDigits.length !== 16 || !luhnValid(numDigits)) return "Número de cartão inválido.";
    if (!toAAMM(form.mes, form.ano)) return "Confira a validade do cartão (mês e ano).";
    if (onlyDigits(form.cvv).length !== 3) return "CVV inválido.";
    if (!isValidCpf(form.cpf)) return "CPF inválido.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    const aamm = toAAMM(form.mes, form.ano)!;
    setError(null);
    setSubmitting(true);
    try {
      const { orderName } = await payWithVr(checkout, {
        nome: form.nome.trim(),
        numero_cartao: onlyDigits(form.numero),
        data_expiracao: aamm,
        cvv: onlyDigits(form.cvv),
        documento: onlyDigits(form.cpf),
      });
      useCartStore.getState().clearCart();
      reset();
      onOpenChange(false);
      navigate("/pedido-confirmado", { state: { orderName } });
    } catch (err) {
      // O backend já devolve `userMessage` em PT-BR por código (declined por classe,
      // 409/429/503/502) — não há tabela de mensagens no cliente.
      setError(
        err instanceof VrCheckoutError && err.userMessage
          ? err.userMessage
          : "Não foi possível processar o pagamento."
      );
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto ph-no-capture">
        <DialogHeader>
          <DialogTitle className="font-['DM_Serif_Display'] text-2xl text-[#1a1a1a]">
            Pagar com VR
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Nome no cartão</label>
            <input
              type="text"
              autoComplete="cc-name"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              maxLength={50}
              required
              className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">Número do cartão</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="cc-number"
              value={formatCardNumber(form.numero)}
              onChange={(e) => setForm((f) => ({ ...f, numero: onlyDigits(e.target.value).slice(0, 16) }))}
              maxLength={19}
              required
              className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <CardExpiryFields
              mes={form.mes}
              ano={form.ano}
              onMesChange={(mes) => setForm((f) => ({ ...f, mes }))}
              onAnoChange={(ano) => setForm((f) => ({ ...f, ano }))}
            />
            <div>
              <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">CVV</label>
              <input
                // type="text" + máscara por CSS: type="password" faz o gerenciador de senhas
                // autopreencher login salvo no CVV (mesmo achado do Alelo, 12/10).
                type="text"
                inputMode="numeric"
                autoComplete="cc-csc"
                style={{ WebkitTextSecurity: "disc" } as CSSProperties}
                value={form.cvv}
                onChange={(e) => setForm((f) => ({ ...f, cvv: onlyDigits(e.target.value).slice(0, 3) }))}
                maxLength={3}
                required
                className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#6b6b6b] font-sans block mb-1">CPF do titular</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={form.cpf}
              onChange={(e) => setForm((f) => ({ ...f, cpf: formatCpf(e.target.value) }))}
              maxLength={14}
              required
              className="w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]"
            />
          </div>

          {error && <p className="text-xs text-red-600 font-sans">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => handleClose(false)}
              className="flex-1 h-11 border border-[#e8e8e4] text-[#1a1a1a] rounded-xl font-semibold text-sm font-sans hover:bg-[#f0efeb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 h-11 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Pagar"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default VrCardDialog;
