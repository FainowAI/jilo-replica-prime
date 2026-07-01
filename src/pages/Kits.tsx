import { Link } from "react-router-dom";
import { ArrowRight, Check, Clock, Snowflake, Truck, Leaf } from "lucide-react";
import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";
import WeeklyKits from "@/components/sections/WeeklyKits";
import SEO from "@/components/SEO";

// ponytail: valores hardcoded espelhando a escala do Shopify (mesma fonte de KIT_SIZES/KIT_TIERS em Kit.tsx/KitLivre.tsx);
// se a escala mudar no Admin, atualizar aqui também.
const DISCOUNT_TIERS = [
  { qty: 7, discount: 5 },
  { qty: 14, discount: 10 },
  { qty: 21, discount: 15 },
  { qty: 28, discount: 20, best: true },
];

const HERO_BENEFITS = [
  { icon: Truck, label: "Frete grátis" },
  { icon: Clock, label: "Pronto em 5 min" },
  { icon: Snowflake, label: "Congelado artesanal" },
  { icon: Leaf, label: "Sem conservantes" },
];

const ctaFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a017] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e3a1e]";

export default function Kits() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground overflow-x-hidden flex flex-col">
      <SEO
        title="Kits de Marmitas | Jilo"
        description="Monte a sua semana com kits de marmitas artesanais congeladas — quanto mais pratos, maior o desconto."
        path="/kits"
      />
      <AnnouncementBar />
      <Header />

      <main className="flex-1">
        {/* ---------- Hero ---------- */}
        <section className="relative overflow-hidden bg-[#1e3a1e]">
          {/* brilho decorativo (CSS puro, sem custo de imagem) */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-1/3 right-[-10%] h-[70vh] w-[70vh] rounded-full bg-[#d4a017]/10 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-[#16301a]"
          />

          <div className="container mx-auto px-4 relative z-10 py-16 md:py-24">
            <div className="max-w-2xl">
              <p className="font-sans text-[#d4a017] text-xs md:text-[13px] tracking-[1.6px] uppercase mb-5">
                Kits da semana
              </p>
              <h1 className="font-['DM_Serif_Display'] text-4xl md:text-[52px] text-white leading-[1.08] mb-6">
                Sua semana resolvida <span className="italic">em um kit.</span>
              </h1>
              <p className="text-base md:text-lg text-[#faf7f2]/85 font-sans leading-relaxed max-w-xl mb-8">
                Marmitas artesanais congeladas, prontas em minutos. Escolha um kit
                temático pronto ou monte o seu do jeito que quiser — e{" "}
                <span className="text-white font-semibold">quanto mais pratos, maior a economia.</span>
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-9">
                <Link
                  to="/kit-livre"
                  className={`group inline-flex items-center justify-center gap-2.5 rounded-2xl bg-[#d4a017] text-[#1e3a1e] px-7 py-4 text-[15px] font-bold font-sans shadow-[0_4px_24px_0_rgba(0,0,0,0.25)] transition-all duration-200 hover:bg-[#e0ad1e] hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${ctaFocus}`}
                >
                  Montar meu Kit Livre
                  <ArrowRight className="w-[18px] h-[18px] transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" />
                </Link>
                <a
                  href="#grade-kits"
                  className={`inline-flex items-center justify-center rounded-2xl border border-white/40 text-white px-7 py-4 text-[15px] font-medium font-sans transition-colors duration-200 hover:bg-white/10 ${ctaFocus}`}
                >
                  Ver kits prontos
                </a>
              </div>

              <ul className="flex flex-wrap gap-2.5">
                {HERO_BENEFITS.map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="inline-flex items-center gap-1.5 bg-[rgba(30,58,30,0.55)] border-[0.8px] border-white/15 text-white rounded-full px-3.5 py-1.5 text-xs font-sans font-medium backdrop-blur-md"
                  >
                    <Icon className="h-[13px] w-[13px] text-[#d4a017]" aria-hidden />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------- Faixa de desconto progressivo ---------- */}
        <section className="py-14 md:py-20 px-4 bg-[#faf7f2]">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center max-w-xl mx-auto mb-10">
              <h2 className="font-['DM_Serif_Display'] text-2xl md:text-3xl text-[#1e3a1e] mb-2">
                Quanto mais pratos, mais você economiza
              </h2>
              <p className="text-sm text-[#6b6b6b] font-sans">
                Desconto progressivo aplicado automaticamente no carrinho.
              </p>
            </div>

            <ol className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {DISCOUNT_TIERS.map((tier) => (
                <li
                  key={tier.qty}
                  className={`relative flex flex-col items-center rounded-2xl py-7 px-3 text-center transition-all duration-200 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                    tier.best
                      ? "bg-[#1e3a1e] text-white shadow-[0_8px_28px_-6px_rgba(30,58,30,0.45)]"
                      : "bg-white border border-[#e8e8e4] hover:border-[#1e3a1e]/30 hover:shadow-md"
                  }`}
                >
                  {tier.best && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#d4a017] text-[#1e3a1e] text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5">
                      Melhor valor
                    </span>
                  )}
                  <span
                    className={`text-3xl font-bold font-sans tabular-nums ${
                      tier.best ? "text-white" : "text-[#1a1a1a]"
                    }`}
                  >
                    {tier.qty}
                  </span>
                  <span
                    className={`text-xs font-sans mt-0.5 ${
                      tier.best ? "text-white/70" : "text-[#9b9b9b]"
                    }`}
                  >
                    pratos
                  </span>
                  <span
                    className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                      tier.best
                        ? "bg-[#d4a017] text-[#1e3a1e]"
                        : "bg-[#1e3a1e]/10 text-[#1e3a1e]"
                    }`}
                  >
                    -{tier.discount}%
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Grade de kits (reuso integral) ---------- */}
        <div id="grade-kits" className="scroll-mt-20">
          <WeeklyKits />
        </div>

        {/* ---------- CTA de fechamento ---------- */}
        <section className="px-4 pb-16 md:pb-24">
          <div className="container mx-auto max-w-4xl">
            <div className="relative overflow-hidden rounded-3xl bg-[#1e3a1e] px-6 py-12 md:px-12 md:py-14 text-center">
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-1/2 left-1/2 -translate-x-1/2 h-[50vh] w-[50vh] rounded-full bg-[#d4a017]/10 blur-3xl"
              />
              <div className="relative z-10">
                <h2 className="font-['DM_Serif_Display'] text-2xl md:text-3xl text-white mb-3">
                  Pronto para montar sua semana?
                </h2>
                <p className="text-sm md:text-base text-[#faf7f2]/80 font-sans max-w-md mx-auto mb-7">
                  Monte um kit do seu jeito ou explore o cardápio completo. O desconto
                  aparece sozinho no carrinho.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    to="/kit-livre"
                    className={`group inline-flex items-center justify-center gap-2.5 rounded-2xl bg-[#d4a017] text-[#1e3a1e] px-7 py-4 text-[15px] font-bold font-sans transition-all duration-200 hover:bg-[#e0ad1e] hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${ctaFocus}`}
                  >
                    Montar meu Kit Livre
                    <ArrowRight className="w-[18px] h-[18px] transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" />
                  </Link>
                  <Link
                    to="/cardapio"
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-white/40 text-white px-7 py-4 text-[15px] font-medium font-sans transition-colors duration-200 hover:bg-white/10 ${ctaFocus}`}
                  >
                    <Check className="w-[18px] h-[18px] text-[#d4a017]" aria-hidden />
                    Ver o cardápio
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
