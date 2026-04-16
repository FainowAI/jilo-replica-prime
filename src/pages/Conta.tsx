import { Outlet } from "react-router-dom";
import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";
import ContaSidebar from "@/components/conta/ContaSidebar";

const Conta = () => {
  return (
    <div className="min-h-screen bg-[#faf7f2]">
      <AnnouncementBar />
      <Header />

      <main className="container mx-auto px-4 py-8 lg:py-12">
        <div className="mb-6">
          <h1 className="font-['DM_Serif_Display'] text-3xl lg:text-4xl text-[#1a1a1a]">Minha conta</h1>
          <p className="text-sm text-[#9b9b9b] font-sans">Gerencie seu perfil, pedidos e endereços</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <ContaSidebar />
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Conta;
