import { Star, ChevronRight, Minus, Plus, ShoppingBag, ShieldCheck, Thermometer, Leaf } from "lucide-react";

export function ProductDetails() {
    return (
        <section className="py-6 lg:py-12">
            <div className="container mx-auto px-4">

                {/* Breadcrumbs */}
                <div className="flex items-center text-sm text-muted-foreground mb-8 overflow-x-auto whitespace-nowrap hide-scrollbar">
                    <a href="/" className="hover:text-primary transition-colors">Página Inicial</a>
                    <ChevronRight className="w-4 h-4 mx-2 text-muted-foreground/50 flex-shrink-0" />
                    <a href="#" className="hover:text-primary transition-colors">Aves & Suínos</a>
                    <ChevronRight className="w-4 h-4 mx-2 text-muted-foreground/50 flex-shrink-0" />
                    <span className="text-secondary-foreground font-medium">Estrogonofe de Frango</span>
                </div>

                <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">

                    {/* Gallery Column */}
                    <div className="space-y-4">
                        <div className="aspect-square bg-secondary rounded-3xl overflow-hidden relative">
                            <img
                                src="/placeholder.svg"
                                alt="Galeria de imagens"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>

                    {/* Buy Box Column */}
                    <div className="flex flex-col">
                        <div className="mb-6">
                            <p className="bg-secondary/50 text-secondary-foreground w-fit rounded-full px-3 py-1 text-sm font-medium mb-4">
                                🍗 Aves & Suínos
                            </p>
                            <h1 className="text-3xl lg:text-4xl text-secondary-foreground mb-4">
                                Estrogonofe de Frango
                            </h1>

                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <div className="flex text-amber-500">
                                    <Star className="w-4 h-4 fill-current" />
                                    <Star className="w-4 h-4 fill-current" />
                                    <Star className="w-4 h-4 fill-current" />
                                    <Star className="w-4 h-4 fill-current" />
                                    <Star className="w-4 h-4 fill-current" />
                                </div>
                                <span className="font-medium text-secondary-foreground ml-1">4,7</span>
                                <span>·</span>
                                <a href="#reviews" className="underline hover:text-primary transition-colors">Ver avaliações dos clientes</a>
                                <span className="hidden sm:inline">|</span>
                                <span>Código: G01</span>
                            </div>
                        </div>

                        <hr className="border-border my-6" />

                        <div className="mb-8">
                            <h3 className="font-semibold text-secondary-foreground mb-3 font-sans">Descrição & Ingredientes</h3>
                            <p className="text-muted-foreground font-sans leading-relaxed text-sm mb-6">
                                O clássico estrogonofe preparado artesanalmente, com cubos macios de peito de frango, molho cremoso à base de creme de leite fresco, champignon e um toque de mostarda. Uma refeição com gosto de comida caseira, pronta em poucos minutos.
                            </p>

                            <div className="space-y-3">
                                <button className="flex items-center justify-between w-full py-3 border-b border-border text-left hover:text-primary transition-colors">
                                    <span className="font-medium font-sans">Ingredientes:</span>
                                    <Plus className="w-4 h-4" />
                                </button>
                                <button className="flex items-center justify-between w-full py-3 border-b border-border text-left hover:text-primary transition-colors">
                                    <span className="font-medium font-sans">Alérgicos:</span>
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="bg-secondary/20 p-6 rounded-2xl mb-8 border border-border/50">
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className="text-3xl font-bold text-secondary-foreground">R$ 24,90</span>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground text-sm mb-4">
                                <span>ou</span>
                                <span className="font-semibold text-secondary-foreground">R$ 23,66</span>
                                <span>via Pix</span>
                            </div>
                            <div className="inline-flex items-center gap-2 bg-[#E8F5E9] text-[#2E7D32] px-3 py-2 rounded-lg text-sm font-medium">
                                💰 5% OFF para pagamentos no PIX
                            </div>
                        </div>

                        {/* Quantity and Add to Cart */}
                        <div className="flex flex-col sm:flex-row gap-4 mb-10">
                            <div className="flex items-center justify-between bg-background border border-border rounded-xl px-4 py-3 sm:w-32 flex-shrink-0">
                                <button className="text-muted-foreground hover:text-foreground transition-colors p-1">
                                    <Minus className="w-4 h-4" />
                                </button>
                                <span className="font-medium font-sans">1</span>
                                <button className="text-muted-foreground hover:text-foreground transition-colors p-1">
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>

                            <button className="flex-1 bg-primary text-primary-foreground font-medium py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-sm">
                                <ShoppingBag className="w-5 h-5" />
                                Adicionar
                            </button>
                        </div>

                        {/* Shipping Calculator */}
                        <div className="mb-8">
                            <p className="font-medium text-secondary-foreground mb-3 font-sans">Calcule o frete</p>
                            <div className="flex gap-2 mb-3">
                                <input
                                    type="text"
                                    placeholder="00000-000"
                                    className="flex-1 border border-border rounded-xl px-4 py-3 bg-background outline-none focus:border-primary transition-colors font-sans"
                                />
                                <button className="bg-secondary text-secondary-foreground px-6 py-3 rounded-xl font-medium hover:bg-secondary/80 transition-colors">
                                    OK
                                </button>
                            </div>
                            <a href="#" className="text-sm font-medium text-primary hover:underline transition-all">Não sei meu CEP →</a>
                        </div>

                        <hr className="border-border mb-6" />

                        {/* Trust Badges */}
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-4 font-sans">Selos de Confiança</p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-sans text-secondary-foreground/80">
                                <div className="flex items-center gap-1.5">
                                    <ShieldCheck className="w-4 h-4 text-green-600" />
                                    <span>Compra segura</span>
                                </div>
                                <span className="hidden sm:inline text-muted-foreground/30">•</span>
                                <div className="flex items-center gap-1.5">
                                    <Thermometer className="w-4 h-4 text-blue-500" />
                                    <span>Entregue gelado</span>
                                </div>
                                <span className="hidden sm:inline text-muted-foreground/30">•</span>
                                <div className="flex items-center gap-1.5">
                                    <Leaf className="w-4 h-4 text-emerald-500" />
                                    <span>Sem conservantes</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </section>
    );
}
