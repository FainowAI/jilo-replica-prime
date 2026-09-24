import { Link, Navigate, useLocation } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Helmet } from "react-helmet-async";
import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";

// ponytail: versão mínima para o ticket 04 (sucesso do pagamento VR não pode cair
// em 404). O ticket 05 adiciona o evento `pagamento concluído` e o polimento.
// O número do pedido chega só por `state` do router (B2) — nunca na URL.
const PedidoConfirmado = () => {
  const location = useLocation();
  const orderName = (location.state as { orderName?: string } | null)?.orderName;

  // Sem state (reload, link colado): manda para a lista de pedidos.
  if (!orderName) return <Navigate to="/conta/pedidos" replace />;

  return (
    <div className="min-h-screen bg-[#faf7f2]">
      <Helmet>
        <title>Pedido confirmado | Jilo</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <AnnouncementBar />
      <Header />
      <main className="max-w-xl mx-auto px-4 py-16 text-center font-sans">
        <CheckCircle2 className="h-14 w-14 text-[#1e3a1e] mx-auto mb-5" />
        <h1 className="font-['DM_Serif_Display'] text-3xl text-[#1a1a1a] mb-2">Pedido confirmado!</h1>
        <p className="text-[#1a1a1a] mb-1">
          Pagamento com VR aprovado. Seu pedido é o <span className="font-bold">{orderName}</span>.
        </p>
        <p className="text-sm text-[#9b9b9b] mb-8">
          Você recebe a confirmação por e-mail e acompanha tudo em Meus Pedidos.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/conta/pedidos"
            className="h-12 px-6 inline-flex items-center justify-center bg-[#1e3a1e] text-white rounded-2xl font-bold hover:bg-[#1e3a1e]/90 transition-colors"
          >
            Ver meus pedidos
          </Link>
          <Link
            to="/cardapio"
            className="h-12 px-6 inline-flex items-center justify-center border border-[#e8e8e4] text-[#1a1a1a] rounded-2xl font-bold hover:border-[#1e3a1e]/40 transition-colors"
          >
            Continuar comprando
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PedidoConfirmado;
