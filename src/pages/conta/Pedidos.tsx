import { Link } from "react-router-dom";
import { Loader2, Package, ChevronRight } from "lucide-react";
import { useOrders } from "@/hooks/useOrders";
import OrderStatusBadge from "@/components/conta/OrderStatusBadge";

const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
const formatCents = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const Pedidos = () => {
  const { data: orders, isLoading } = useOrders();

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8e4] p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#1e3a1e]" />
      </div>
    );
  }

  if (!orders?.length) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8e4] p-12 text-center">
        <Package className="h-10 w-10 text-[#9b9b9b] mx-auto mb-3" />
        <p className="text-sm text-[#9b9b9b] font-sans mb-4">Você ainda não tem pedidos</p>
        <Link to="/cardapio"
          className="h-10 px-4 bg-[#1e3a1e] text-white rounded-xl font-bold text-sm font-sans hover:bg-[#1e3a1e]/90 transition-colors inline-flex items-center gap-2">
          Ver cardápio
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-['DM_Serif_Display'] text-xl text-[#1a1a1a]">Meus pedidos</h2>
        <p className="text-sm text-[#9b9b9b] font-sans">{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}</p>
      </div>

      <div className="space-y-3">
        {orders.map((order) => (
          <Link key={order.id} to={`/conta/pedidos/${order.id}`}
            className="block bg-white rounded-2xl border border-[#e8e8e4] p-4 hover:border-[#1e3a1e]/40 transition-colors">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-[#1a1a1a] font-sans">
                    Pedido #{order.shopify_order_number ?? order.shopify_order_id.slice(-8)}
                  </span>
                  <OrderStatusBadge status={order.status} />
                </div>
                <p className="text-xs text-[#9b9b9b] font-sans">
                  {formatDate(order.placed_at ?? order.created_at)} · {formatCents(order.total_cents)}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-[#9b9b9b] flex-shrink-0" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Pedidos;
