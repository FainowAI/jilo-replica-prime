import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";
import { ProductDetails } from "@/components/sections/ProductDetails";
import { ProductComposition } from "@/components/sections/ProductComposition";
import { PreparationSteps } from "@/components/sections/PreparationSteps";
import { ProductReviews } from "@/components/sections/ProductReviews";
import { RelatedProducts } from "@/components/sections/RelatedProducts";

export default function Produto() {
    return (
        <div className="min-h-screen bg-background font-sans text-foreground overflow-x-hidden">
            <AnnouncementBar />
            <Header />
            <main className="pt-24 lg:pt-32">
                <ProductDetails />
                <ProductComposition />
                <PreparationSteps />
                <ProductReviews />
                <RelatedProducts />
            </main>
            <Footer />
        </div>
    );
}
