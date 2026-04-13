import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Box, Loader2 } from "lucide-react";
import { storefrontApiRequest, COLLECTION_BY_HANDLE_QUERY, type ShopifyProduct } from "@/lib/shopify";

interface KitConfig {
  name: string;
  slug: string;
  handle?: string;
  tagline: string;
  badge?: string;
  bgColor: string;
  emoji: string;
}

const KIT_CONFIGS: KitConfig[] = [
  { name: "Kit Leveza", slug: "kit-leveza", handle: "kit-leveza", tagline: "Ave & Suína · Sabor do dia a dia", bgColor: "bg-[#1e3a1e]", emoji: "🍗" },
  { name: "Kit Sabor", slug: "kit-sabor", handle: "kit-sabor", tagline: "Peixe & Massa · Variedade a cada refeição", bgColor: "bg-[#6b4226]", emoji: "🐟" },
  { name: "Kit Força", slug: "kit-forca", handle: "kit-forca", tagline: "Bovinos · Proteína de alto valor", badge: "Mais pedido", bgColor: "bg-[#2c3e50]", emoji: "🥩" },
  { name: "Kit Verde", slug: "kit-verde", handle: "kit-verde", tagline: "Plant-based · Alimentação consciente", bgColor: "bg-[#4a5c2f]", emoji: "🌱" },
];

const KIT_LIVRE: KitConfig = { name: "Kit Livre", slug: "kit-livre", tagline: "Monte do seu jeito · Qualquer grupo", badge: "Novo", bgColor: "bg-[#d4a017]", emoji: "🍱" };

const formatPrice = (amount: string) => {
  return parseFloat(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const KitCard = ({ kit, priceFrom, loading }: { kit: KitConfig; priceFrom: string | null; loading: boolean }) => {
  const linkTo = kit.slug === "kit-livre" ? "/kit-livre" : `/kit/${kit.slug}`;

  return (
    <Link to={linkTo} className="block">
      <div className={`relative flex flex-col rounded-[20px] overflow-hidden ${kit.bgColor} min-h-[280px] hover:scale-[1.02] transition-transform duration-300`}>
        {/* Background Gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: "linear-gradient(155.65deg, rgba(255,255,255,0.06) 8.49%, rgba(0,0,0,0) 58.3%)" }}
        />

        <div className="relative p-6 flex flex-col h-full z-10">
          <div className="flex items-start justify-between min-h-[24px]">
            {kit.badge ? (
              <span className="inline-flex bg-[#d4a017] text-[#1e3a1e] text-[11px] font-bold px-2.5 py-1 rounded-[100px] font-sans">
                {kit.badge}
              </span>
            ) : (
              <span />
            )}
            <Box className="w-5 h-5 text-white opacity-80" strokeWidth={1.5} />
          </div>

          <div className="mt-4 mb-8">
            <div className="text-[24px] mb-2">{kit.emoji}</div>
            <h3 className="text-white text-[24px] font-['DM_Serif_Display'] leading-[27.6px] mb-1">
              {kit.name}
            </h3>
            <p className="text-[13px] text-white/70 font-sans leading-[18.2px]">
              {kit.tagline}
            </p>
          </div>

          <div className="mt-auto pt-4 border-t border-white/15 flex items-center justify-between">
            <div>
              <span className="text-[13px] text-white/85 font-medium font-sans">a partir de</span>
              <br />
              {loading ? (
                <Loader2 className="w-4 h-4 text-white animate-spin mt-1" />
              ) : (
                <span className="text-[15px] font-bold text-white font-sans">
                  {priceFrom ? `R$ ${priceFrom}/un` : "—"}
                </span>
              )}
            </div>

            <span className="inline-flex items-center gap-2 border border-white/50 rounded-[100px] px-3 py-2 text-[13px] text-white font-semibold font-sans hover:bg-white/10 transition-colors">
              Ver Kit
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
};

const WeeklyKits = () => {
  const [kitPrices, setKitPrices] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrices = async () => {
      setLoading(true);
      const prices: Record<string, string | null> = {};

      await Promise.all(
        KIT_CONFIGS.map(async (kit) => {
          if (!kit.handle) return;
          try {
            const data = await storefrontApiRequest(COLLECTION_BY_HANDLE_QUERY, { handle: kit.handle, first: 20 });
            const products = data?.data?.collectionByHandle?.products?.edges || [];
            if (products.length > 0) {
              const minPrice = Math.min(...products.map((p: ShopifyProduct) => parseFloat(p.node.priceRange.minVariantPrice.amount)));
              const priceFrom = (minPrice * 0.90).toFixed(2); // 10% off = kit de 7
              prices[kit.slug] = formatPrice(priceFrom);
            } else {
              prices[kit.slug] = null;
            }
          } catch {
            prices[kit.slug] = null;
          }
        })
      );

      // Kit Livre uses the lowest price across all kits
      const allPrices = Object.values(prices).filter(Boolean) as string[];
      if (allPrices.length > 0) {
        const lowestNumeric = Math.min(...allPrices.map(p => parseFloat(p.replace(',', '.'))));
        prices["kit-livre"] = formatPrice(lowestNumeric.toFixed(2));
      } else {
        prices["kit-livre"] = null;
      }

      setKitPrices(prices);
      setLoading(false);
    };

    fetchPrices();
  }, []);

  const allKits = [...KIT_CONFIGS, KIT_LIVRE];

  return (
    <section id="kits" className="py-16 lg:py-20 bg-white">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex flex-col items-center text-center mb-10 gap-1.5">
          <p className="bg-[rgba(30,58,30,0.08)] text-[#2d5016] text-[12px] uppercase tracking-[1.2px] font-semibold font-sans px-[24px] py-[4px] rounded-[100px]">
            Monte do seu jeito
          </p>
          <h2 className="text-[36px] text-[#1e3a1e] font-['DM_Serif_Display'] leading-tight mt-1">
            Kits para a Semana
          </h2>
          <p className="text-[16px] text-[#6b6b6b] font-sans mt-2 max-w-lg mx-auto">
            Monte sua semana de uma vez. Mais fácil, mais barato, mais organizado.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {allKits.map((kit) => (
            <KitCard key={kit.slug} kit={kit} priceFrom={kitPrices[kit.slug] ?? null} loading={loading} />
          ))}
        </div>

        <div className="text-center mt-12">
          <Link
            to="/kit-livre"
            className="inline-flex items-center gap-2 border border-[#1e3a1e] text-[#1e3a1e] rounded-[100px] px-8 py-3 text-[14px] font-semibold font-sans hover:bg-[#1e3a1e]/5 transition-colors"
          >
            Ver todos os kits
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default WeeklyKits;
