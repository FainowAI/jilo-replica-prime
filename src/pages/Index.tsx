import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Hero from "@/components/sections/Hero";
import BenefitsBar from "@/components/sections/BenefitsBar";
import Philosophy from "@/components/sections/Philosophy";
import QuickCategories from "@/components/sections/QuickCategories";
import Favorites from "@/components/sections/Favorites";
import WeeklyKits from "@/components/sections/WeeklyKits";
import AllDishes from "@/components/sections/AllDishes";
import HowItWorks from "@/components/sections/HowItWorks";
import Testimonials from "@/components/sections/Testimonials";
import OurStory from "@/components/sections/OurStory";
import FAQ from "@/components/sections/FAQ";
import Footer from "@/components/sections/Footer";
import SEO from "@/components/SEO";
import { faqJsonLd } from "@/components/sections/FAQ";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Jilo | Marmitas Artesanais Prontas em 5 min"
        description="Pratos artesanais congelados, prontos em 5 minutos. Sem conservantes, sem improviso. 26 pratos em 4 grupos. Entrega em 48h na Grande São Paulo."
        path="/"
        jsonLd={faqJsonLd}
      />
      <AnnouncementBar />
      <Header />
      <main>
        <Hero />
        <BenefitsBar />
        <Philosophy />
        <QuickCategories />
        <Favorites />
        <WeeklyKits />
        <AllDishes />
        <HowItWorks />
        <Testimonials />
        <OurStory />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
