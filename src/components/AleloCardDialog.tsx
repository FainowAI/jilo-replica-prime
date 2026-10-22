import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import CardExpiryFields from "@/components/CardExpiryFields";
import { useCartStore } from "@/stores/cartStore";
import { useProfile } from "@/hooks/useProfile";
import { isValidCpf, formatCpf, onlyDigits } from "@/lib/vr/card";
import {
  getSopToken,
  payWithAlelo,
  AleloCheckoutError,
  GENERIC_ERROR_MESSAGE,
  type AleloCheckoutInput,
} from "@/lib/alelo/client";
import { composeExpiry } from "@/lib/alelo/expiry";
import { SOP_CLASS, sopHolderName, sopInvalidMessage, type SopInvalidField } from "@/lib/alelo/sop";

interface AleloCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkout: AleloCheckoutInput;
}

// H4/H5: a URL do script vem DESTA constante, nunca da resposta da edge.
export const SOP_SCRIPT_URL = "https://www.pagador.com.br/post/scripts/silentorderpost-1.0.min.js";

interface SopOptions {
  accessToken: string;
  environment: string;
  language: string;
  cardType: string;
  onSuccess: (r: { PaymentToken?: string }) => void;
  onError: (r?: { Code?: number | string }) => void;
  onInvalid: (fields?: SopInvalidField[]) => void;
}
type SopWindow = Window & { bpSop_silentOrderPost?: (o: SopOptions) => void };

function loadSopScript(): Promise<void> {
  if ((window as SopWindow).bpSop_silentOrderPost) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SOP_SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("sop_script_load"));
    document.head.appendChild(s);
  });
}

const inputCls =
  "w-full px-3 py-2 border border-[#e8e8e4] rounded-lg text-sm font-sans focus:outline-none focus:border-[#1e3a1e]";
const labelCls = "text-xs font-semibold text-[#6b6b6b] font-sans block mb-1";

const AleloCardDialog = ({ open, onOpenChange, checkout }: AleloCardDialogProps) => {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  // H5: nome/número/CVV NÃO são state — ficam no DOM (classes bp-sop-*) e o SOP os lê direto.
  // Só o CPF e mês/ano da validade (não são PAN/CVV) são controlados; o SOP lê a validade de um input
  // oculto (expiryRef) preenchido com "MM/AAAA" no submit — o teclado numérico do celular não tem "/".
  const nameRef = useRef<HTMLInputElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const cvvRef = useRef<HTMLInputElement>(null);
  const [cpf, setCpf] = useState("");
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 202 payment_pending: trava novo pagamento enquanto o diálogo estiver aberto.
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open && profile?.cpf && !cpf) setCpf(formatCpf(profile.cpf));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile?.cpf]);

  const clearCardFields = () => {
    for (const r of [nameRef, numberRef, expiryRef, cvvRef]) if (r.current) r.current.value = "";
    setMes("");
    setAno("");
  };

  const handleClose = (next: boolean) => {
    if (!next && submitting) return;
    if (!next) {
      clearCardFields();
      setError(null);
      setPending(false);
    }
    onOpenChange(next);
  };

  const fail = (msg: string) => {
    setError(msg);
    setSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || pending) return;
    if (!nameRef.current?.value.trim()) return setError("Informe o nome impresso no cartão.");
    if (!isValidCpf(cpf)) return setError("CPF inválido.");
    const expiry = composeExpiry(mes, ano);
    if (!expiry) return setError("Confira a validade do cartão (mês e ano).");
    if (expiryRef.current) expiryRef.current.value = expiry; // o SOP lê "MM/AAAA" deste input
    // O SOP lê os valores direto do DOM e recusa espaço no número/CVV e acento no nome: normaliza aqui.
    nameRef.current.value = sopHolderName(nameRef.current.value);
    if (numberRef.current) numberRef.current.value = onlyDigits(numberRef.current.value);
    if (cvvRef.current) cvvRef.current.value = onlyDigits(cvvRef.current.value);
    if (!nameRef.current.value) return setError("Confira o nome no cartão (só letras, sem acento).");
    setError(null);
    setSubmitting(true);
    try {
      // Nova tokenização a cada tentativa (PaymentToken é de uso único).
      const sop = await getSopToken(checkout.cartId);
      await loadSopScript();
      const sopFn = (window as SopWindow).bpSop_silentOrderPost;
      if (!sopFn) throw new Error("sop_script_missing");

      sopFn({
        accessToken: sop.accessToken,
        environment: sop.environment === "prod" ? "production" : sop.environment,
        language: "PT",
        cardType: "debitCard",
        onSuccess: async (r) => {
          const paymentToken = r?.PaymentToken;
          const holderName = nameRef.current?.value.trim() ?? "";
          clearCardFields(); // PAN/CVV saem do DOM assim que o token chega
          if (!paymentToken) return fail(GENERIC_ERROR_MESSAGE);
          try {
            const { orderName } = await payWithAlelo(checkout, { cpf: onlyDigits(cpf), holderName, paymentToken });
            useCartStore.getState().clearCart();
            onOpenChange(false);
            navigate("/pedido-confirmado", { state: { orderName } });
          } catch (err) {
            if (err instanceof AleloCheckoutError && err.pending) setPending(true);
            fail(err instanceof AleloCheckoutError ? err.userMessage : GENERIC_ERROR_MESSAGE);
          }
        },
        // Nunca repassar/logar a resposta do SOP (traz PAN mascarado/BIN): só o status HTTP vai para a tela.
        onError: (r) => {
          clearCardFields();
          const code = r?.Code ? ` (código ${r.Code})` : "";
          fail(`Não foi possível validar o cartão. Confira os dados e tente novamente.${code}`);
        },
        // O array traz só o nome do campo e um texto fixo do script, sem o valor digitado.
        onInvalid: (fields) => fail(sopInvalidMessage(fields)),
      });
    } catch (err) {
      // Falha de script/token: sem fallback para campo de cartão próprio.
      fail(err instanceof AleloCheckoutError ? err.userMessage : GENERIC_ERROR_MESSAGE);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto ph-no-capture">
        <DialogHeader>
          <DialogTitle className="font-['DM_Serif_Display'] text-2xl text-[#1a1a1a]">
            Alelo Refeição / Alimentação
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 mt-2 ph-no-capture" autoComplete="off">
          <div>
            <label className={labelCls}>Nome no cartão</label>
            <input
              ref={nameRef}
              type="text"
              autoComplete="cc-name"
              maxLength={50}
              required
              className={`${inputCls} ${SOP_CLASS.holder}`}
            />
          </div>
          <div>
            <label className={labelCls}>Número do cartão</label>
            <input
              ref={numberRef}
              type="text"
              inputMode="numeric"
              autoComplete="cc-number"
              maxLength={23} // 19 dígitos + espaços; os espaços saem no submit
              required
              className={`${inputCls} ${SOP_CLASS.number}`}
            />
          </div>
          {/* Campo oculto que o SOP lê (não é type="hidden" para o script enxergá-lo como input de texto). */}
          <input
            ref={expiryRef}
            type="text"
            aria-hidden="true"
            tabIndex={-1}
            readOnly
            autoComplete="off"
            className={`sr-only ${SOP_CLASS.expiry}`}
          />
          {/* O script ignora a opção cardType e só lê este campo (aceita CreditCard ou DebitCard). Alelo = débito. */}
          <input
            type="text"
            aria-hidden="true"
            tabIndex={-1}
            readOnly
            value="DebitCard"
            className={`sr-only ${SOP_CLASS.cardType}`}
          />
          <div className="grid grid-cols-3 gap-2">
            <CardExpiryFields mes={mes} ano={ano} onMesChange={setMes} onAnoChange={setAno} />
            <div>
              <label className={labelCls}>CVV</label>
              <input
                ref={cvvRef}
                // type="text" + máscara por CSS: type="password" faz o gerenciador de senhas
                // do navegador autopreencher login salvo em validade/CVV (visto em 12/10).
                type="text"
                inputMode="numeric"
                autoComplete="cc-csc"
                style={{ WebkitTextSecurity: "disc" } as CSSProperties}
                maxLength={4}
                required
                className={`${inputCls} ${SOP_CLASS.cvv}`}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>CPF do titular</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={cpf}
              maxLength={14}
              required
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              className={inputCls}
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
              disabled={submitting || pending}
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

export default AleloCardDialog;
