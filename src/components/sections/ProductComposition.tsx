import { Lightbulb, Info, Scale, Snowflake, Clock } from "lucide-react";

export function ProductComposition() {
    return (
        <section className="py-16 bg-muted/30">
            <div className="container mx-auto px-4">

                <div className="mb-12 max-w-2xl">
                    <p className="text-sm font-medium text-muted-foreground mb-3 font-sans">Transparência artesanal</p>
                    <h2 className="text-3xl lg:text-4xl text-secondary-foreground mb-4">
                        O que tem na sua marmita
                    </h2>
                    <p className="text-muted-foreground font-sans leading-relaxed">
                        Cada ingrediente escolhido com cuidado. Nada de conservantes, aromatizantes ou nomes que você não consegue pronunciar.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8 md:gap-12 mb-16 relative">
                    {/* Vertical dividers for md+ screens */}
                    <div className="hidden md:block absolute top-0 bottom-0 left-1/3 w-px bg-border/50" />
                    <div className="hidden md:block absolute top-0 bottom-0 left-2/3 w-px bg-border/50" />

                    {/* Column 1: Proteína */}
                    <div className="relative">
                        <div className="w-12 h-12 bg-background border border-border rounded-xl flex items-center justify-center text-xl mb-6 shadow-sm">
                            🍗
                        </div>
                        <h3 className="text-xl font-semibold text-secondary-foreground mb-4 font-sans">
                            Proteína
                        </h3>
                        <ul className="space-y-3">
                            <li className="flex items-start gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary-foreground mt-2 flex-shrink-0" />
                                <span className="text-muted-foreground font-sans text-sm">Filé de frango cozido em cubos</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary-foreground mt-2 flex-shrink-0" />
                                <span className="text-muted-foreground font-sans text-sm">Molho cremoso de estrogonofe</span>
                            </li>
                        </ul>
                        {/* Mobile divider */}
                        <div className="block md:hidden h-px bg-border/50 w-full mt-8" />
                    </div>

                    {/* Column 2: Base */}
                    <div className="relative">
                        <div className="w-12 h-12 bg-background border border-border rounded-xl flex items-center justify-center text-xl mb-6 shadow-sm">
                            🍚
                        </div>
                        <h3 className="text-xl font-semibold text-secondary-foreground mb-4 font-sans">
                            Base
                        </h3>
                        <ul className="space-y-3">
                            <li className="flex items-start gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary-foreground mt-2 flex-shrink-0" />
                                <span className="text-muted-foreground font-sans text-sm">Arroz branco cozido no ponto</span>
                            </li>
                        </ul>
                        {/* Mobile divider */}
                        <div className="block md:hidden h-px bg-border/50 w-full mt-8" />
                    </div>

                    {/* Column 3: Guarnição */}
                    <div className="relative">
                        <div className="w-12 h-12 bg-background border border-border rounded-xl flex items-center justify-center text-xl mb-6 shadow-sm">
                            🥔
                        </div>
                        <h3 className="text-xl font-semibold text-secondary-foreground mb-4 font-sans">
                            Guarnição
                        </h3>
                        <ul className="space-y-3">
                            <li className="flex items-start gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary-foreground mt-2 flex-shrink-0" />
                                <span className="text-muted-foreground font-sans text-sm">Batata cubo frita</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary-foreground mt-2 flex-shrink-0" />
                                <span className="text-muted-foreground font-sans text-sm">Temperada com ervas naturais</span>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Technical details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border border-y border-border py-8 mb-8">
                    <div className="flex items-center gap-4 py-4 md:py-0 md:pl-0 md:pr-8">
                        <div className="w-10 h-10 bg-secondary/30 rounded-full flex items-center justify-center text-secondary-foreground shrink-0 border border-secondary">
                            <Scale className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 font-sans">Peso</p>
                            <p className="text-secondary-foreground font-medium font-sans text-sm">500g</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 py-4 md:py-0 md:px-8">
                        <div className="w-10 h-10 bg-secondary/30 rounded-full flex items-center justify-center text-secondary-foreground shrink-0 border border-secondary">
                            <Snowflake className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 font-sans">Conservação</p>
                            <p className="text-secondary-foreground font-medium font-sans text-sm">Freezer por até 90 dias</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 py-4 md:py-0 md:pl-8">
                        <div className="w-10 h-10 bg-secondary/30 rounded-full flex items-center justify-center text-secondary-foreground shrink-0 border border-secondary">
                            <Clock className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 font-sans">Preparo</p>
                            <p className="text-secondary-foreground font-medium font-sans text-sm">3–5 min no micro-ondas</p>
                        </div>
                    </div>
                </div>

                {/* Info banners */}
                <div className="space-y-4">
                    <div className="flex items-start gap-4 bg-[#FFF8E1] text-[#F57F17] p-5 rounded-2xl">
                        <Lightbulb className="w-5 h-5 shrink-0 mt-0.5" />
                        <p className="text-sm font-medium leading-relaxed font-sans">
                            Dica: Mexa o conteúdo na metade do tempo para aquecer por igual.
                        </p>
                    </div>
                    <p className="text-sm text-muted-foreground font-sans flex items-center gap-2">
                        <span className="text-lg">🌿</span> Produzido artesanalmente em cozinha própria certificada.
                    </p>
                </div>

            </div>
        </section>
    );
}
