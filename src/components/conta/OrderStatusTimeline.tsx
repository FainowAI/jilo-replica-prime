import { Check, Circle } from "lucide-react";
import type { CustomerOrderHistoryEntry } from "@/hooks/useOrders";

const STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  preparing: "Em preparo",
  dispatched: "Saiu pra entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const formatDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
});

const OrderStatusTimeline = ({ history }: { history: CustomerOrderHistoryEntry[] }) => {
  if (!history.length) {
    return <p className="text-sm text-[#9b9b9b] font-sans">Sem histórico disponível</p>;
  }

  return (
    <ol className="relative border-l-2 border-[#e8e8e4] pl-5 space-y-5">
      {history.map((entry, i) => {
        const isLast = i === history.length - 1;
        return (
          <li key={entry.id} className="relative">
            <div className={`absolute -left-[29px] top-0 w-5 h-5 rounded-full flex items-center justify-center ${
              isLast ? "bg-[#1e3a1e]" : "bg-white border-2 border-[#1e3a1e]"
            }`}>
              {isLast ? <Check className="h-3 w-3 text-white" /> : <Circle className="h-2 w-2 fill-[#1e3a1e] text-[#1e3a1e]" />}
            </div>
            <p className="text-sm font-semibold text-[#1a1a1a] font-sans">
              {STATUS_LABELS[entry.to_status] ?? entry.to_status}
            </p>
            <p className="text-xs text-[#9b9b9b] font-sans">{formatDateTime(entry.changed_at)}</p>
            {entry.note && <p className="text-xs text-[#6b6b6b] font-sans mt-1">{entry.note}</p>}
          </li>
        );
      })}
    </ol>
  );
};

export default OrderStatusTimeline;
