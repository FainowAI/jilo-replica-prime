import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useCartSync } from "@/hooks/useCartSync";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Product from "./pages/Product";
import Cardapio from "./pages/Cardapio";
import Collection from "./pages/Collection";
import Carrinho from "./pages/Carrinho";
import Kit from "./pages/Kit";
import KitLivre from "./pages/KitLivre";
import Login from "./pages/Login";
import Cadastro from "./pages/Cadastro";
import Conta from "./pages/Conta";
import Perfil from "./pages/conta/Perfil";
import Pedidos from "./pages/conta/Pedidos";
import PedidoDetalhe from "./pages/conta/PedidoDetalhe";
import Enderecos from "./pages/conta/Enderecos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppContent = () => {
  useCartSync();
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/produto/:handle" element={<Product />} />
          <Route path="/cardapio" element={<Cardapio />} />
          <Route path="/colecao/:categoria" element={<Collection />} />
          <Route path="/carrinho" element={<Carrinho />} />
          <Route path="/kit/:slug" element={<Kit />} />
          <Route path="/kit-livre" element={<KitLivre />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route
            path="/conta"
            element={
              <ProtectedRoute>
                <Conta />
              </ProtectedRoute>
            }
          >
            <Route index element={<Perfil />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="pedidos" element={<Pedidos />} />
            <Route path="pedidos/:id" element={<PedidoDetalhe />} />
            <Route path="enderecos" element={<Enderecos />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppContent />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
