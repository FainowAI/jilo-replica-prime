import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";
import { FullMenu } from "@/components/sections/FullMenu";

export default function Cardapio() {
    return (
        <div className="min-h-screen bg-background font-sans text-foreground overflow-x-hidden flex flex-col">
            <AnnouncementBar />
            <Header />
            <main className="flex-1">
                <FullMenu />
            </main>
            <Footer />
        </div>
    );
}
