import { MapPin, ThermometerSnowflake, Zap } from "lucide-react";

interface ProductCompositionProps {
    productType: string;
}

const INGREDIENT_DATA: Record<string, { protein: string[], base: string[], garnish: string[] }> = {
    "Carne Vermelha": {
        protein: ["Corte magro de carne bovina", "Molho da casa"],
        base: ["Arroz branco cozido no ponto"],
        garnish: ["Batata rústica assada", "Legumes ao vapor"]
    },
    "Frango": {
        protein: ["Filé de frango cozido em cubos", "Molho cremoso de estrogonofe"],
        base: ["Arroz branco cozido no ponto"],
        garnish: ["Batata cubo frita", "Temperada com ervas naturais"]
    },
    "Peixe": {
        protein: ["Filé de peixe assado", "Molho de ervas"],
        base: ["Arroz branco cozido no ponto"],
        garnish: ["Purê de batata", "Mix de legumes"]
    },
    "Vegano": {
        protein: ["Hambúrguer de grão de bico", "Molho de tomate caseiro"],
        base: ["Arroz integral"],
        garnish: ["Brócolis salteado", "Cenoura assada"]
    },
    "Vegetariano": {
        protein: ["Omelete recheado", "Queijo branco"],
        base: ["Arroz integral"],
        garnish: ["Salada de folhas", "Tomate cereja"]
    },
};

const DEFAULT_DATA = {
    protein: ["Proteína principal preparada com carinho", "Tempero especial"],
    base: ["Acompanhamento base selecionado"],
    garnish: ["Guarnição fresca", "Temperos naturais"]
};

export default function ProductComposition({ productType }: ProductCompositionProps) {
    // Try to find an exact match or use the default
    const ingredients = Object.entries(INGREDIENT_DATA).find(([key]) => productType?.toLowerCase().includes(key.toLowerCase()))?.[1] || DEFAULT_DATA;

    return (
        <div className="w-full bg-[#FAF7F2] py-[64px] border-t border-[#e8e8e4]">
            {/* Header Area */}
            <div className="flex flex-col items-center mb-[48px] text-center w-full">
                <div className="flex items-center gap-[16px] w-full mb-[32px]">
                    <span className="shrink-0 bg-[#f0efeb] text-[#1e3a1e] font-bold text-[11px] font-sans px-[12px] py-[6px] rounded-[100px] uppercase tracking-[0.44px]">
                        SEÇÃO 05
                    </span>
                    <span className="shrink-0 text-[#b0aea8] text-[11px] font-bold font-sans uppercase tracking-[0.44px]">
                        COMPOSIÇÃO DO PRATO
                    </span>
                    <div className="h-px bg-[#e8e8e4] flex-1" />
                </div>

                <div className="flex flex-col items-start text-left w-full max-w-[800px] mx-auto">
                    <h4 className="text-[11px] font-bold text-[#d4a017] font-sans uppercase tracking-[0.88px] mb-[12px]">
                        TRANSPARÊNCIA ARTESANAL
                    </h4>
                    <h2 className="text-[32px] md:text-[40px] text-[#1a1a1a] font-['DM_Serif_Display'] leading-[42px] mb-[16px]">
                        O que tem na sua marmita
                    </h2>
                    <p className="text-[16px] text-[#6b6b6b] font-sans leading-[24px]">
                        Cada ingrediente escolhido com cuidado. <span className="italic font-medium text-[#2d5016]">Nada de conservantes, nada escondido.</span>
                    </p>
                </div>
            </div>

            {/* Ingredients Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[24px] mb-[32px] max-w-[800px] mx-auto">
                {/* Protein */}
                <div className="bg-white border-[1.5px] border-[#e8e8e4] rounded-[20px] p-[32px] md:col-span-2 lg:col-span-1 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.02)] flex flex-col items-start text-left">
                    <div className="w-[48px] h-[48px] bg-[#f0efeb] rounded-full flex items-center justify-center mb-[24px] text-[24px]">
                        🍗
                    </div>
                    <h3 className="text-[24px] text-[#1a1a1a] font-['DM_Serif_Display'] mb-[16px] w-full">Proteína</h3>
                    <ul className="space-y-[12px] w-full">
                        {ingredients.protein.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-[12px]">
                                <div className="w-[6px] h-[6px] rounded-full bg-[#d4a017] mt-[8px] shrink-0" />
                                <span className="text-[15px] text-[#6b6b6b] font-sans leading-[22.5px]">{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Base */}
                <div className="bg-white border-[1.5px] border-[#e8e8e4] rounded-[20px] p-[32px] shadow-[0px_2px_12px_0px_rgba(0,0,0,0.02)] flex flex-col items-start text-left">
                    <div className="w-[48px] h-[48px] bg-[#f0efeb] rounded-full flex items-center justify-center mb-[24px] text-[24px]">
                        🍚
                    </div>
                    <h3 className="text-[24px] text-[#1a1a1a] font-['DM_Serif_Display'] mb-[16px] w-full">Base</h3>
                    <ul className="space-y-[12px] w-full">
                        {ingredients.base.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-[12px]">
                                <div className="w-[6px] h-[6px] rounded-full bg-[#d4a017] mt-[8px] shrink-0" />
                                <span className="text-[15px] text-[#6b6b6b] font-sans leading-[22.5px]">{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Garnish */}
                <div className="bg-white border-[1.5px] border-[#e8e8e4] rounded-[20px] p-[32px] shadow-[0px_2px_12px_0px_rgba(0,0,0,0.02)] flex flex-col items-start text-left">
                    <div className="w-[48px] h-[48px] bg-[#f0efeb] rounded-full flex items-center justify-center mb-[24px] text-[24px]">
                        🥔
                    </div>
                    <h3 className="text-[24px] text-[#1a1a1a] font-['DM_Serif_Display'] mb-[16px] w-full">Guarnição</h3>
                    <ul className="space-y-[12px] w-full">
                        {ingredients.garnish.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-[12px]">
                                <div className="w-[6px] h-[6px] rounded-full bg-[#d4a017] mt-[8px] shrink-0" />
                                <span className="text-[15px] text-[#6b6b6b] font-sans leading-[22.5px]">{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Properties Row */}
            <div className="flex flex-col md:flex-row bg-white border-[1.5px] border-[#e8e8e4] rounded-[20px] divide-y md:divide-y-0 md:divide-x divide-[#e8e8e4] max-w-[800px] mx-auto mb-[24px] shadow-[0px_2px_12px_0px_rgba(0,0,0,0.02)]">
                <div className="flex flex-1 items-center p-[24px] gap-[16px]">
                    <div className="w-[40px] h-[40px] bg-[#f0efeb] rounded-[12px] flex items-center justify-center text-[20px]">
                        ⚖️
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-[#b0aea8] font-sans uppercase tracking-[0.44px] mb-[2px]">PESO</span>
                        <span className="text-[15px] font-bold text-[#1a1a1a] font-sans">500g</span>
                    </div>
                </div>
                <div className="flex flex-1 items-center p-[24px] gap-[16px]">
                    <div className="w-[40px] h-[40px] bg-[#f0efeb] rounded-[12px] flex items-center justify-center text-[#1e3a1e]">
                        <ThermometerSnowflake className="w-[20px] h-[20px]" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-[#b0aea8] font-sans uppercase tracking-[0.44px] mb-[2px]">CONSERVAÇÃO</span>
                        <span className="text-[15px] font-bold text-[#1a1a1a] font-sans">Freezer por até 90 dias</span>
                    </div>
                </div>
                <div className="flex flex-1 items-center p-[24px] gap-[16px]">
                    <div className="w-[40px] h-[40px] bg-[#f0efeb] rounded-[12px] flex items-center justify-center text-[#1e3a1e]">
                        <Zap className="w-[20px] h-[20px]" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-[#b0aea8] font-sans uppercase tracking-[0.44px] mb-[2px]">PREPARO</span>
                        <span className="text-[15px] font-bold text-[#1a1a1a] font-sans">3-5 min no micro-ondas</span>
                    </div>
                </div>
            </div>

            {/* Footer text */}
            <div className="flex items-center justify-center gap-[6px] text-center w-full">
                <span className="text-[14px]">🌿</span>
                <span className="text-[13px] text-[#b0aea8] font-sans">
                    Produzido artesanalmente em cozinha própria certificada pela ANVISA · São Paulo, SP
                </span>
            </div>
        </div>
    );
}
