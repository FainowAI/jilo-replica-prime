import { Star, ShieldCheck } from "lucide-react";

const reviews = [
    {
        name: "Ana Beatriz M.",
        city: "São Paulo",
        time: "Há 2 dias",
        rating: 5,
        text: "O estrogonofe é incrível! O molho tem aquele gostinho de comida feita em casa. Muito prático para o dia a dia corrido.",
        verified: true,
    },
    {
        name: "Ricardo T.",
        city: "Santo André",
        time: "Há 5 dias",
        rating: 5,
        text: "Chegou super gelado e bem embalado. O sabor surpreendeu positivamente. A porção é muito bem servida, vale a pena.",
        verified: true,
    },
    {
        name: "Julia F.",
        city: "São Paulo",
        time: "Há 1 semana",
        rating: 5,
        text: "Muito bom! Prático e saboroso. A carne é super macia e o tempero é na medida certa, não é enjoativo.",
        verified: true,
    }
];

export function ProductReviews() {
    return (
        <section id="reviews" className="py-16 lg:py-24 bg-muted/30 border-y border-border">
            <div className="container mx-auto px-4">

                <div className="mb-16">
                    <p className="text-sm font-medium text-muted-foreground mb-3 font-sans">Avaliações verificadas</p>
                    <h2 className="text-3xl lg:text-4xl text-secondary-foreground">
                        O que dizem sobre esse prato
                    </h2>
                </div>

                <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start mb-20">

                    {/* Rating Summary */}
                    <div className="lg:col-span-4 flex flex-col items-center lg:items-start text-center lg:text-left">
                        <div className="flex items-baseline gap-2 mb-4">
                            <span className="text-7xl font-bold tracking-tight text-secondary-foreground">4,7</span>
                            <span className="text-muted-foreground font-semibold font-sans">de 5</span>
                        </div>

                        <div className="flex text-amber-500 mb-2">
                            <Star className="w-6 h-6 fill-current" />
                            <Star className="w-6 h-6 fill-current" />
                            <Star className="w-6 h-6 fill-current" />
                            <Star className="w-6 h-6 fill-current" />
                            <Star className="w-6 h-6 fill-current" />
                        </div>

                        <p className="text-muted-foreground font-sans font-medium">
                            (38 avaliações)
                        </p>
                    </div>

                    {/* Rating Bars */}
                    <div className="lg:col-span-8 flex flex-col justify-center space-y-3 max-w-md w-full mx-auto lg:mx-0">
                        {[
                            { stars: "5 ★", pct: 78 },
                            { stars: "4 ★", pct: 14 },
                            { stars: "3 ★", pct: 5 },
                            { stars: "2 ★", pct: 2 },
                            { stars: "1 ★", pct: 1 },
                        ].map((row) => (
                            <div key={row.stars} className="flex items-center gap-4 text-sm font-sans font-medium text-muted-foreground">
                                <span className="w-8 shrink-0">{row.stars}</span>
                                <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-secondary-foreground rounded-full"
                                        style={{ width: `${row.pct}%` }}
                                    />
                                </div>
                                <span className="w-10 text-right shrink-0">{row.pct}%</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Divider text */}
                <div className="relative mb-12">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center">
                        <span className="bg-background/80 px-4 text-sm font-medium text-muted-foreground font-sans uppercase tracking-widest backdrop-blur-sm">
                            Avaliações recentes
                        </span>
                    </div>
                </div>

                {/* Reviews Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {reviews.map((review, index) => (
                        <div key={index} className="bg-background rounded-2xl p-6 lg:p-8 border border-border shadow-sm flex flex-col">

                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold text-lg font-sans">
                                        {review.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-secondary-foreground font-sans">{review.name}</h4>
                                        <p className="text-xs text-muted-foreground font-sans">{review.city}</p>
                                    </div>
                                </div>
                                <span className="text-xs text-muted-foreground font-sans pt-1">
                                    {review.time}
                                </span>
                            </div>

                            <div className="flex text-amber-500 mb-4">
                                {[...Array(review.rating)].map((_, i) => (
                                    <Star key={i} className="w-4 h-4 fill-current" />
                                ))}
                            </div>

                            <p className="text-muted-foreground text-sm font-sans leading-relaxed mb-6 flex-1">
                                "{review.text}"
                            </p>

                            {review.verified && (
                                <div className="flex items-center gap-2 text-xs font-semibold text-green-600 bg-green-50 w-fit px-2 py-1 rounded-md mb-0 mt-auto">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    Compra verificada
                                </div>
                            )}
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}
