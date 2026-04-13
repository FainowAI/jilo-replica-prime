import { useState } from "react";
import { MapPin, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { validateCep, formatCep, type CepValidationResult } from "@/lib/cepValidator";

interface CepCheckerProps {
  onResult?: (result: CepValidationResult) => void;
  className?: string;
}

const CepChecker = ({ onResult, className = "" }: CepCheckerProps) => {
  const [cep, setCep] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CepValidationResult | null>(null);

  const handleCheck = async () => {
    if (cep.replace(/\D/g, "").length !== 8) return;
    setLoading(true);
    try {
      const validation = await validateCep(cep);
      setResult(validation);
      onResult?.(validation);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <p className="text-sm text-[#9b9b9b] font-sans mb-2">Verifique se entregamos na sua região</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9b9b9b]" />
          <input
            type="text"
            value={cep}
            onChange={(e) => { setCep(formatCep(e.target.value)); setResult(null); }}
            placeholder="00000-000"
            className="w-full pl-9 pr-4 py-2.5 border border-[#e8e8e4] rounded-lg text-sm font-sans bg-transparent focus:outline-none focus:border-[#1e3a1e] transition-colors"
            maxLength={9}
            onKeyDown={(e) => e.key === "Enter" && handleCheck()}
          />
        </div>
        <button
          onClick={handleCheck}
          disabled={loading || cep.replace(/\D/g, "").length !== 8}
          className="px-3 sm:px-5 py-2.5 bg-[#1e3a1e] text-white rounded-lg text-sm font-bold font-sans hover:bg-[#1e3a1e]/90 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar"}
        </button>
      </div>

      {result && (
        <div className={`flex items-start gap-2 mt-3 p-3 rounded-lg text-sm font-sans ${
          result.isDeliverable
            ? "bg-[#1e3a1e]/5 text-[#1e3a1e]"
            : result.isValid
              ? "bg-amber-50 text-amber-800"
              : "bg-red-50 text-red-700"
        }`}>
          {result.isDeliverable
            ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            : <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          }
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
};

export default CepChecker;
