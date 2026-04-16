const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "Aguardando pagamento", className: "bg-[#d4a017]/10 text-[#d4a017]" },
  paid: { label: "Pago", className: "bg-[#1e3a1e]/10 text-[#1e3a1e]" },
  preparing: { label: "Em preparo", className: "bg-[#1e3a1e]/10 text-[#1e3a1e]" },
  dispatched: { label: "Saiu pra entrega", className: "bg-[#32bcad]/10 text-[#32bcad]" },
  delivered: { label: "Entregue", className: "bg-[#1e3a1e] text-white" },
  cancelled: { label: "Cancelado", className: "bg-red-100 text-red-600" },
  refunded: { label: "Reembolsado", className: "bg-[#9b9b9b]/20 text-[#9b9b9b]" },
};

const OrderStatusBadge = ({ status }: { status: string }) => {
  const config = STATUS_CONFIG[status] ?? { label: status, className: "bg-[#9b9b9b]/20 text-[#9b9b9b]" };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold font-sans ${config.className}`}>
      {config.label}
    </span>
  );
};

export default OrderStatusBadge;
