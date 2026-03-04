import { Check } from "lucide-react";

interface Review {
    id: string;
    name: string;
    location: string;
    timeAgo: string;
    text: string;
    rating: number;
    avatarUrl: string;
    verified: boolean;
}

const MOCK_REVIEWS: Review[] = [
    {
        id: "1",
        name: "Ana Beatriz M.",
        location: "São Paulo",
        timeAgo: "Há 2 dias",
        text: `"O estrogonofe é incrível! O molho tem aquele gostinho caseiro que eu sentia falta. Já virou item fixo da minha..."`,
        rating: 5,
        avatarUrl:
            "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150&h=150",
        verified: true,
    },
    {
        id: "2",
        name: "Ricardo T.",
        location: "Santo André",
        timeAgo: "Há 5 dias",
        text: `"Chegou super gelado e bem embalado. O sabor surpreende — parece comida de restaurante, não..."`,
        rating: 5,
        avatarUrl:
            "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=150&h=150",
        verified: true,
    },
    {
        id: "3",
        name: "Julia F.",
        location: "Guarulhos",
        timeAgo: "Há 1 semana",
        text: `"Muito bom! Só diminuiria um pouco o sal, mas o frango é macio e o molho cremoso. Recomendo."`,
        rating: 4,
        avatarUrl:
            "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=150&h=150",
        verified: true,
    },
];

interface ProductReviewsProps {
    productId?: string;
}

const StarRating = ({ rating }: { rating: number }) => {
    return (
        <div className="flex gap-[4px]">
            {[1, 2, 3, 4, 5].map((star) => (
                <svg
                    key={star}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill={star <= rating ? "#d4a017" : "#e8e8e4"}
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
            ))}
        </div>
    );
};

export default function ProductReviews({ productId }: ProductReviewsProps) {
    return (
        <section className="bg-white py-[64px] px-[24px]">
            <div className="max-w-[1216px] mx-auto flex flex-col items-center">
                {/* Header Section */}
                <div className="text-center mb-[48px] flex flex-col items-center">
                    <div className="flex items-center gap-[12px] mb-[16px]">
                        <span className="bg-[#f0efeb] text-[#1e3a1e] text-[11px] font-bold px-[10px] py-[4px] tracking-wider rounded-sm uppercase">
                            SEÇÃO 08
                        </span>
                        <span className="text-[#b0aea8] text-[12px] font-medium tracking-wider uppercase">
                            AVALIAÇÕES DO PRODUTO
                        </span>
                    </div>

                    <h3 className="text-[#d4a017] text-[11px] font-bold tracking-[0.2em] uppercase mb-[16px]">
                        AVALIAÇÕES VERIFICADAS
                    </h3>
                    <h2 className="text-[#1a1a1a] text-[32px] md:text-[40px] font-['DM_Serif_Display'] leading-[1.2]">
                        O que dizem sobre esse prato
                    </h2>
                </div>

                {/* Overall Rating Block */}
                <div className="flex flex-col items-center mb-[64px]">
                    <div className="flex items-baseline gap-[8px] mb-[8px]">
                        <span className="text-[#d4a017] text-[64px] font-['DM_Serif_Display'] leading-none">
                            4,7
                        </span>
                        <span className="text-[#b0aea8] text-[16px]">de 5</span>
                    </div>
                    <div className="mb-[8px]">
                        <div className="flex gap-[8px]">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <svg
                                    key={star}
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill={star <= 4.7 ? "#d4a017" : "#e8e8e4"}
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                </svg>
                            ))}
                        </div>
                    </div>
                    <div className="text-[#b0aea8] text-[14px] mb-[24px]">
                        (38 avaliações)
                    </div>

                    {/* Distribution Bars */}
                    <div className="w-full max-w-[400px] flex flex-col gap-[8px]">
                        {[
                            { label: "5 ★", width: "78%", value: "78%" },
                            { label: "4 ★", width: "14%", value: "14%" },
                            { label: "3 ★", width: "5%", value: "5%" },
                            { label: "2 ★", width: "2%", value: "2%" },
                            { label: "1 ★", width: "1%", value: "1%" },
                        ].map((bar) => (
                            <div key={bar.label} className="flex items-center gap-[12px]">
                                <span className="text-[#1a1a1a] text-[12px] font-bold w-[30px]">
                                    {bar.label}
                                </span>
                                <div className="flex-1 h-[6px] bg-[#e8e8e4] rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-[#d4a017] rounded-full"
                                        style={{ width: bar.width }}
                                    ></div>
                                </div>
                                <span className="text-[#b0aea8] text-[12px] min-w-[32px] text-right">
                                    {bar.value}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Divider */}
                <div className="w-full flex items-center justify-center mb-[48px] relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-[#e8e8e4]"></div>
                    </div>
                    <div className="relative bg-white px-[16px]">
                        <span className="text-[#b0aea8] text-[14px]">Avaliações recentes</span>
                    </div>
                </div>

                {/* Reviews Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-[24px] mb-[48px] w-full">
                    {MOCK_REVIEWS.map((review) => (
                        <div
                            key={review.id}
                            className="bg-white border-[1.5px] border-[#e8e8e4] rounded-[20px] p-[32px] flex flex-col"
                        >
                            <div className="flex justify-between items-start mb-[16px]">
                                <div className="flex gap-[16px] items-center">
                                    <img
                                        src={review.avatarUrl}
                                        alt={review.name}
                                        className="w-[48px] h-[48px] rounded-full object-cover"
                                    />
                                    <div>
                                        <h4 className="text-[#1a1a1a] font-bold text-[16px] leading-tight">
                                            {review.name}
                                        </h4>
                                        <span className="text-[#b0aea8] text-[13px]">
                                            {review.location}
                                        </span>
                                    </div>
                                </div>
                                <span className="text-[#b0aea8] text-[13px] whitespace-nowrap">
                                    {review.timeAgo}
                                </span>
                            </div>

                            <div className="mb-[16px]">
                                <StarRating rating={review.rating} />
                            </div>

                            <p className="text-[#1a1a1a] text-[15px] italic leading-relaxed flex-1 mb-[24px]">
                                {review.text}
                            </p>

                            {review.verified && (
                                <div className="inline-flex items-center gap-[6px] bg-[#f0efeb] text-[#1a1a1a] text-[12px] font-medium px-[12px] py-[6px] rounded-[100px] w-fit">
                                    <Check className="w-[14px] h-[14px]" />
                                    <span>Compra verificada</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Action Button */}
                <button className="border border-[#1e3a1e] text-[#1e3a1e] font-bold text-[14px] px-[32px] py-[12px] rounded-[100px] hover:bg-[#1e3a1e] hover:text-white transition-colors duration-200">
                    Ver todas as avaliações →
                </button>
            </div>
        </section>
    );
}
