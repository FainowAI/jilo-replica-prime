import { useParams, Link } from "react-router-dom";
import { Loader2, ArrowLeft, Package, MapPin } from "lucide-react";
import { useOrderDetails } from "@/hooks/useOrderDetails";
import OrderStatusBadge from "@/components/conta/OrderStatusBadge";
import OrderStatusTimeline from "@/components/conta/OrderStatusTimeline";

const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
const formatCents = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

interface ShippingAddress {
  recipient_name?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
}

const PedidoDetalhe = () => {
  const { id } = useParams();
  const { data, isLoading } = useOrderDetails(id);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8e4] p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#1e3a1e]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8e4] p-12 text-center">
        <p className="text-sm text-[#9b9b9b] font-sans mb-4">Pedido não encontrado</p>
        <Link to="/conta/pedidos" className="text-sm text-[#1e3a1e] font-semibold hover:underline">
          Voltar aos pedidos
        </Link>
      </div>
    );
  }

  const { order, items, history } = data;
  const shipping = (order.shipping_address ?? {}) as ShippingAddress;

  return (
    <div className="space-y-4">
      <Link to="/conta/pedidos"
        className="inline-flex items-center gap-1.5 text-sm text-[#9b9b9b] hover:text-[#1a1a1a] font-sans transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar aos pedidos
      </Link>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-[#e8e8e4] p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-['DM_Serif_Display'] text-2xl text-[#1a1a1a]">
              Pedido #{order.shopify_order_number ?? order.shopify_order_id.slice(-8)}
            </h2>
            <p className="text-sm text-[#9b9b9b] font-sans">
              Feito em {formatDate(order.placed_at ?? order.created_at)}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Esquerda: itens + timeline */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#e8e8e4] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-4 w-4 text-[#1e3a1e]" />
              <h3 className="font-semibold text-[#1a1a1a] font-sans text-sm">Itens do pedido</h3>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-[#9b9b9b] font-sans">Nenhum item detalhado disponível.</p>
            ) : (
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2 border-b border-[#e8e8e4] last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1a1a1a] font-sans truncate">{item.product_title}</p>
                      {item.variant_title && <p className="text-xs text-[#9b9b9b] font-sans">{item.variant_title}</p>}
                      <p className="text-xs text-[#9b9b9b] font-sans">Qtd {item.quantity} · {formatCents(item.unit_price_cents)}/un</p>
                    </div>
                    <p className="text-sm font-bold text-[#1a1a1a] font-sans">{formatCents(item.line_total_cents)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[#e8e8e4] p-5">
            <h3 className="font-semibold text-[#1a1a1a] font-sans text-sm mb-4">Histórico do pedido</h3>
            <OrderStatusTimeline history={history} />
          </div>
        </div>

        {/* Direita: resumo + endereço */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#e8e8e4] p-5 space-y-2 font-sans text-sm">
            <h3 className="font-semibold text-[#1a1a1a] mb-2">Resumo</h3>
            <div className="flex justify-between"><span className="text-[#9b9b9b]">Subtotal</span><span>{formatCents(order.subtotal_cents)}</span></div>
            {!!order.discount_cents && <div className="flex justify-between"><span className="text-[#9b9b9b]">Desconto</span><span className="text-[#1e3a1e]">-{formatCents(order.discount_cents)}</span></div>}
            <div className="flex justify-between"><span className="text-[#9b9b9b]">Frete</span><span className="text-[#1e3a1e]">Grátis</span></div>
            <div className="h-px bg-[#e8e8e4] my-2" />
            <div className="flex justify-between font-bold text-[#1a1a1a]"><span>Total</span><span>{formatCents(order.total_cents)}</span></div>
            {order.payment_method && <p className="text-xs text-[#9b9b9b] pt-2">Pagamento via {order.payment_method}</p>}
            {order.coupon_code && <p className="text-xs text-[#9b9b9b]">Cupom: {order.coupon_code}</p>}
          </div>

          {shipping && (shipping.street || shipping.city) && (
            <div className="bg-white rounded-2xl border border-[#e8e8e4] p-5 font-sans text-sm space-y-0.5">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-[#1e3a1e]" />
                <h3 className="font-semibold text-[#1a1a1a]">Endereço de entrega</h3>
              </div>
              {shipping.recipient_name && <p className="font-medium text-[#1a1a1a]">{shipping.recipient_name}</p>}
              {shipping.street && <p>{shipping.street}, {shipping.number}{shipping.complement ? ` — ${shipping.complement}` : ""}</p>}
              {shipping.neighborhood && <p className="text-[#9b9b9b]">{shipping.neighborhood}, {shipping.city} — {shipping.state}</p>}
              {shipping.cep && <p className="text-[#9b9b9b]">CEP {shipping.cep}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PedidoDetalhe;
