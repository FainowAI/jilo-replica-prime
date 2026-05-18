import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";
import { FullMenu } from "@/components/sections/FullMenu";
import SEO from "@/components/SEO";

export default function Cardapio() {
    return (
        <div className="min-h-screen bg-background font-sans text-foreground overflow-x-hidden flex flex-col">
            <SEO
                title="Cardápio Jilo | Marmitas Artesanais Congeladas"
                description="Explore os 26 pratos artesanais Jilo: aves, suínos, bovinos, peixes, massas e veganos. Congelados sem conservantes, prontos em 5 minutos."
                path="/cardapio"
            />
            <AnnouncementBar />
            <Header />
            <main className="flex-1">
                <FullMenu />
            </main>
            <Footer />
        </div>
    );
}
