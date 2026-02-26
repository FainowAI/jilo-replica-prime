import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Hero from "@/components/sections/Hero";
import BenefitsBar from "@/components/sections/BenefitsBar";
import Philosophy from "@/components/sections/Philosophy";
import QuickCategories from "@/components/sections/QuickCategories";
import Favorites from "@/components/sections/Favorites";
import WeeklyKits from "@/components/sections/WeeklyKits";
import VaVrSection from "@/components/sections/VaVrSection";
import AllDishes from "@/components/sections/AllDishes";
import HowItWorks from "@/components/sections/HowItWorks";
import Testimonials from "@/components/sections/Testimonials";
import OurStory from "@/components/sections/OurStory";
import FAQ from "@/components/sections/FAQ";
import Footer from "@/components/sections/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <AnnouncementBar />
      <Header />
      <main>
        <Hero />
        <BenefitsBar />
        <Philosophy />
        <QuickCategories />
        <Favorites />
        <WeeklyKits />
        <VaVrSection />
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
