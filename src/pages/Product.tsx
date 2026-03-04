import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Minus, Plus, ShoppingBag, Zap, Star, ShieldCheck, ThermometerSnowflake, Leaf } from "lucide-react";
import { storefrontApiRequest, PRODUCT_BY_HANDLE_QUERY, PRODUCTS_QUERY } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Header from "@/components/sections/Header";
import Footer from "@/components/sections/Footer";
import ProductComposition from "@/components/sections/ProductComposition";
import { toast } from "sonner";

const formatPrice = (amount: string) => {
  return `R$ ${parseFloat(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getPixDiscount = (amount: string) => {
  const price = parseFloat(amount);
  return price * 0.95;
};

const CATEGORY_EMOJIS: Record<string, string> = {
  "Aves e Suinos": "🍗",
  "Aves & Suínos": "🍗",
  "Bovinos": "🥩",
  "Peixes e Massas": "🐟",
  "Peixes & Massas": "🐟",
  "Veganos": "🌱",
  "Sopas": "🥣",
};

const getBadgeVariant = (tag: string): "default" | "secondary" | "outline" | "destructive" => {
  const tagLower = tag.toLowerCase();
  if (tagLower.includes('mais-pedido') || tagLower.includes('mais pedido')) return "destructive";
  if (tagLower.includes('novo')) return "secondary";
  return "outline";
};

const getIngredientText = (productType: string) => {
  const typeMap: Record<string, string> = {
    "Carne Vermelha": "Proteína de carne vermelha premium + Arroz Branco + Acompanhamento(s) selecionados",
    "Frango": "Proteína de frango fresco + Arroz Branco + Acompanhamento(s) selecionados",
    "Peixe": "Proteína de peixe fresco + Arroz Branco + Acompanhamento(s) selecionados",
    "Vegano": "Proteína vegetal + Arroz Branco + Acompanhamento(s) selecionados",
    "Vegetariano": "Proteína vegetariana + Arroz Branco + Acompanhamento(s) selecionados",
  };

  return typeMap[productType] || "Feito com ingredientes frescos e selecionados artesanalmente pela DaJu.";
};

export default function Product() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const addItem = useCartStore((state) => state.addItem);
  const getCheckoutUrl = useCartStore((state) => state.getCheckoutUrl);
  const isLoading = useCartStore((state) => state.isLoading);

  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);

  const { data: productData, isLoading: productLoading } = useQuery({
    queryKey: ['product', handle],
    queryFn: async () => {
      const data = await storefrontApiRequest(PRODUCT_BY_HANDLE_QUERY, { handle });
      return data?.data?.productByHandle;
    },
    enabled: !!handle,
  });

  const { data: relatedData } = useQuery({
    queryKey: ['related-products', productData?.productType],
    queryFn: async () => {
      const data = await storefrontApiRequest(PRODUCTS_QUERY, {
        first: 5,
        query: `product_type:${productData.productType}`,
      });
      return data?.data?.products?.edges || [];
    },
    enabled: !!productData?.productType,
  });

  useEffect(() => {
    if (productData?.variants?.edges?.[0]) {
      setSelectedVariantId(productData.variants.edges[0].node.id);
    }
  }, [productData]);

  if (productLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2]">
        <Header />
        <div className="container mx-auto px-4 py-20 text-center">
          <p className="text-[#1E3A1E]">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!productData) {
    return (
      <div className="min-h-screen bg-[#FAF7F2]">
        <Header />
        <div className="container mx-auto px-4 py-20 text-center">
          <p className="text-[#1E3A1E] text-xl mb-4">Produto não encontrado</p>
          <Button asChild>
            <Link to="/">Voltar para Home</Link>
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const selectedVariant = productData.variants.edges.find(
    (v: any) => v.node.id === selectedVariantId
  )?.node;

  const price = selectedVariant?.price?.amount || productData.priceRange.minVariantPrice.amount;
  const pixPrice = getPixDiscount(price);

  const images = productData.images.edges.map((e: any) => e.node);
  const relatedProducts = relatedData?.filter((p: any) => p.node.handle !== handle).slice(0, 4) || [];

  const handleAddToCart = async () => {
    if (!selectedVariant) {
      toast.error("Selecione uma variante");
      return;
    }

    await addItem({
      product: { node: productData },
      variantId: selectedVariant.id,
      variantTitle: selectedVariant.title,
      price: selectedVariant.price,
      quantity,
      selectedOptions: selectedVariant.selectedOptions,
    });

    toast.success("Produto adicionado ao carrinho!");
  };

  const handleBuyNow = async () => {
    if (!selectedVariant) {
      toast.error("Selecione uma variante");
      return;
    }

    await addItem({
      product: { node: productData },
      variantId: selectedVariant.id,
      variantTitle: selectedVariant.title,
      price: selectedVariant.price,
      quantity,
      selectedOptions: selectedVariant.selectedOptions,
    });

    const checkoutUrl = getCheckoutUrl();
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    } else {
      toast.error("Erro ao redirecionar para checkout");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <Header />

      <div className="container mx-auto px-4 py-8 lg:px-[40px] max-w-[1200px]">
        {/* Breadcrumb */}
        <nav className="flex flex-wrap items-center gap-[8px] text-[13px] font-['DM_Sans'] text-[#6b6b6b] mb-[32px] lg:mb-[48px]">
          <Link to="/" className="hover:text-[#1a1a1a] transition-colors">Página Inicial</Link>
          <ChevronRight className="w-[12px] h-[12px]" />
          <Link to={`/cardapio`} className="hover:text-[#1a1a1a] transition-colors">
            {productData.productType || "Cardápio"}
          </Link>
          <ChevronRight className="w-[12px] h-[12px]" />
          <span className="text-[#1a1a1a] font-medium">{productData.title}</span>
        </nav>

        <div className="grid lg:grid-cols-[1fr_480px] gap-[40px] lg:gap-[80px] mb-[64px] items-start">
          {/* Image Gallery */}
          <div className="flex flex-col gap-[16px] sticky top-[100px]">
            <div className="w-full aspect-square rounded-[24px] shadow-[0px_4px_24px_0px_rgba(0,0,0,0.04)] overflow-hidden bg-white">
              <img
                src={images[selectedImage]?.url || '/placeholder.svg'}
                alt={images[selectedImage]?.altText || productData.title}
                className="w-full h-full object-cover"
              />
            </div>
            {images.length > 1 && (
              <div className="flex gap-[12px] overflow-x-auto no-scrollbar pb-2">
                {images.map((img: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(idx)}
                    className={`shrink-0 w-[80px] h-[80px] rounded-[16px] overflow-hidden border-[2px] transition-all ${selectedImage === idx ? 'border-[#1e3a1e]' : 'border-transparent'
                      }`}
                  >
                    <img src={img.url} alt={img.altText || ''} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="flex flex-col">

            {/* Category */}
            <div className="mb-[12px]">
              <span className="inline-flex items-center gap-1 bg-[#f0efeb] text-[#1e3a1e] text-[11px] font-bold font-sans px-[10px] py-[4px] rounded-[100px] uppercase tracking-[0.33px]">
                {CATEGORY_EMOJIS[productData.productType] || ""} {productData.productType || "Prato Principal"}
              </span>
            </div>

            <h1 className="font-['DM_Serif_Display'] text-[32px] md:text-[40px] leading-[42px] text-[#1a1a1a] mb-[12px]">
              {productData.title}
            </h1>

            {/* Ratings and Code */}
            <div className="flex flex-wrap items-center gap-[12px] mb-[24px]">
              <div className="flex items-center gap-[2px] text-[#d4a017]">
                <Star className="w-[14px] h-[14px] fill-current" />
                <Star className="w-[14px] h-[14px] fill-current" />
                <Star className="w-[14px] h-[14px] fill-current" />
                <Star className="w-[14px] h-[14px] fill-current" />
                <Star className="w-[14px] h-[14px] fill-current" />
                <span className="text-[13px] font-bold font-sans text-[#1a1a1a] ml-1">4.7</span>
              </div>
              <span className="text-[13px] text-[#6b6b6b] cursor-pointer hover:text-[#1a1a1a] underline underline-offset-2 decoration-[#e8e8e4] hover:decoration-[#1a1a1a] transition-all">
                Ver avaliações dos clientes
              </span>
              <div className="w-px h-[12px] bg-[#e8e8e4]" />
              <span className="text-[13px] text-[#b0aea8]">
                Cód: {productData.variants.edges[0]?.node.sku || productData.id?.slice(-6) || "JL01"}
              </span>
            </div>

            {/* Description */}
            {productData.description && (
              <p className="text-[16px] text-[#6b6b6b] font-sans leading-[25.6px] mb-[32px]">
                {productData.description}
              </p>
            )}

            {/* Price section */}
            <div className="flex flex-col mb-[32px]">
              <div className="flex items-baseline gap-[8px] mb-[4px]">
                {selectedVariant?.compareAtPrice ? (
                  <span className="text-[16px] text-[#b8b5b0] line-through font-sans">
                    {formatPrice(selectedVariant.compareAtPrice.amount)}
                  </span>
                ) : (
                  <span className="text-[16px] text-[#b8b5b0] line-through font-sans">
                    {formatPrice(price)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-baseline gap-[8px]">
                <span className="text-[36px] font-bold text-[#1e3a1e] font-sans leading-[36px] tracking-[-0.72px]">
                  {formatPrice(pixPrice.toString())}
                </span>
                <span className="text-[15px] font-bold text-[#1e3a1e] font-sans">via Pix</span>
              </div>
              <div className="inline-flex items-center gap-[6px] border border-[#e8e8e4] bg-[#faf7f2] rounded-[100px] px-[12px] py-[6px] mt-[16px] w-fit">
                <span className="text-[12px] leading-[12px] flex items-center justify-center bg-[#d4a017]/20 w-[20px] h-[20px] rounded-full text-[#d4a017]">⚡</span>
                <span className="text-[11px] font-bold text-[#d4a017] uppercase tracking-[0.33px] font-sans">
                  5% off para pagamentos no pix
                </span>
              </div>
            </div>

            {/* Quantity and Actions row */}
            <div className="flex flex-col sm:flex-row gap-[16px] mb-[40px]">
              <div className="flex items-center justify-between border-[1.5px] border-[#e8e8e4] bg-white rounded-[16px] w-full sm:w-[140px] h-[56px] px-[8px]">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                  className="w-[36px] h-[36px] flex items-center justify-center text-[#1a1a1a] hover:bg-[#f0efeb] rounded-[10px] transition-colors disabled:opacity-50"
                >
                  <Minus className="w-[18px] h-[18px]" />
                </button>
                <span className="text-[16px] font-bold text-[#1a1a1a] font-sans select-none">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-[36px] h-[36px] flex items-center justify-center text-[#1a1a1a] hover:bg-[#f0efeb] rounded-[10px] transition-colors"
                >
                  <Plus className="w-[18px] h-[18px]" />
                </button>
              </div>

              <Button
                className="flex-1 h-[56px] bg-[#1E3A1E] hover:bg-[#1E3A1E]/90 text-white rounded-[16px] font-bold text-[14px] tracking-[0.84px] shadow-[0px_8px_24px_0px_rgba(30,58,30,0.25)] hover:shadow-[0px_12px_32px_0px_rgba(30,58,30,0.3)] transition-all flex items-center justify-center gap-[10px]"
                onClick={handleAddToCart}
                disabled={isLoading || !selectedVariant?.availableForSale}
              >
                {isLoading ? <span className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></span> : <ShoppingBag className="w-[20px] h-[20px]" />}
                ADICIONAR
              </Button>
            </div>

            {/* Calcule o Frete */}
            <div className="bg-white border-[1.5px] border-[#e8e8e4] rounded-[20px] p-[24px] mb-[40px] shadow-[0px_2px_12px_0px_rgba(0,0,0,0.02)]">
              <h3 className="text-[15px] font-bold text-[#1a1a1a] font-sans mb-[16px] flex items-center gap-[8px]">
                🚚 Calcule o frete e prazo de entrega
              </h3>
              <div className="flex flex-col sm:flex-row gap-[12px] mb-[12px]">
                <input
                  type="text"
                  placeholder="00000-000"
                  className="flex-1 h-[48px] border-[1.5px] border-[#e8e8e4] bg-[#faf7f2] rounded-[12px] px-[16px] text-[15px] text-[#1a1a1a] focus:outline-none focus:border-[#1e3a1e] transition-colors"
                />
                <button className="h-[48px] px-[32px] bg-[#e8e8e4] hover:bg-[#d4d4cf] text-[#1a1a1a] text-[14px] font-bold rounded-[12px] transition-colors font-sans uppercase tracking-[0.42px]">
                  OK
                </button>
              </div>
              <a href="#" className="inline-flex text-[13px] text-[#6b6b6b] hover:text-[#1a1a1a] font-medium font-sans underline underline-offset-4 decoration-[#e8e8e4] hover:decoration-[#1a1a1a] transition-colors items-center gap-[4px] w-fit">
                Não sei meu CEP <ChevronRight className="w-[12px] h-[12px] hidden sm:block" />
              </a>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap gap-[24px] mb-[40px] pt-[32px] border-t-[1.5px] border-[#e8e8e4]">
              <div className="flex items-center gap-[10px]">
                <div className="bg-[#f0efeb] w-[36px] h-[36px] rounded-full flex items-center justify-center">
                  <ShieldCheck className="w-[18px] h-[18px] text-[#1e3a1e]" />
                </div>
                <span className="text-[13px] font-bold text-[#1a1a1a] font-sans">Compra segura</span>
              </div>
              <div className="flex items-center gap-[10px]">
                <div className="bg-[#f0efeb] w-[36px] h-[36px] rounded-full flex items-center justify-center">
                  <ThermometerSnowflake className="w-[18px] h-[18px] text-[#1e3a1e]" />
                </div>
                <span className="text-[13px] font-bold text-[#1a1a1a] font-sans">Entregue gelado</span>
              </div>
              <div className="flex items-center gap-[10px]">
                <div className="bg-[#f0efeb] w-[36px] h-[36px] rounded-full flex items-center justify-center">
                  <Leaf className="w-[18px] h-[18px] text-[#1e3a1e]" />
                </div>
                <span className="text-[13px] font-bold text-[#1a1a1a] font-sans">Sem conservantes</span>
              </div>
            </div>

            {/* Accordions */}
            <div className="space-y-[12px]">
              <Accordion type="single" collapsible className="w-full bg-white border-[1.5px] border-[#e8e8e4] rounded-[16px] px-[24px] shadow-[0px_2px_12px_0px_rgba(0,0,0,0.02)]">
                <AccordionItem value="ingredients" className="border-none">
                  <AccordionTrigger className="text-[#1A1A1A] font-bold font-sans text-[15px] hover:no-underline py-[20px] gap-2">
                    🌿 Ingredientes
                  </AccordionTrigger>
                  <AccordionContent className="text-[#6b6b6b] text-[15px] font-sans leading-[24px] pb-[24px]">
                    <p className="mb-2 font-medium text-[#1a1a1a]">Todos os pratos incluem:</p>
                    <p className="leading-relaxed">{getIngredientText(productData.productType)}</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <Accordion type="single" collapsible className="w-full bg-white border-[1.5px] border-[#e8e8e4] rounded-[16px] px-[24px] shadow-[0px_2px_12px_0px_rgba(0,0,0,0.02)]">
                <AccordionItem value="alergicos" className="border-none">
                  <AccordionTrigger className="text-[#1A1A1A] font-bold font-sans text-[15px] hover:no-underline py-[20px] gap-2">
                    ⚠️ Alérgicos
                  </AccordionTrigger>
                  <AccordionContent className="text-[#6b6b6b] text-[15px] font-sans leading-[24px] pb-[24px]">
                    Contém glúten, leite e derivados. Pode conter traços de nozes.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <Accordion type="single" collapsible className="w-full bg-white border-[1.5px] border-[#e8e8e4] rounded-[16px] px-[24px] shadow-[0px_2px_12px_0px_rgba(0,0,0,0.02)]">
                <AccordionItem value="preparo" className="border-none">
                  <AccordionTrigger className="text-[#1A1A1A] font-bold font-sans text-[15px] hover:no-underline py-[20px] gap-2">
                    ♨️ Modo de preparo
                  </AccordionTrigger>
                  <AccordionContent className="text-[#6b6b6b] text-[15px] font-sans leading-[24px] pb-[24px]">
                    Micro-ondas: Retire a película protetora, coloque a bandeja no micro-ondas e aqueça em potência alta por 5 a 6 minutos. Verifique se está totalmente quente antes de consumir.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </div>

        <ProductComposition productType={productData.productType} />

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="mb-[64px] border-t border-[#e8e8e4] pt-[64px]">
            <h2 className="font-['DM_Serif_Display'] text-[32px] md:text-[40px] text-[#1a1a1a] mb-[24px]">
              Quem viu, comprou
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-[16px] md:gap-[24px]">
              {relatedProducts.map((product: any) => (
                <div
                  key={product.node.id}
                  className="group flex flex-col h-full bg-white rounded-[20px] shadow-[0px_2px_16px_0px_rgba(0,0,0,0.04)] overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-lg"
                  onClick={() => {
                    navigate(`/produto/${product.node.handle}`);
                    window.scrollTo(0, 0);
                  }}
                >
                  <div className="relative aspect-square bg-[#f0efeb] overflow-hidden">
                    <img
                      src={product.node.images.edges[0]?.node.url || '/placeholder.svg'}
                      alt={product.node.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="flex flex-col flex-1 p-[16px] bg-white">
                    <h3 className="text-[13px] font-bold text-[#1a1a1a] mb-[8px] font-['DM_Sans'] leading-[18px] line-clamp-2">
                      {product.node.title}
                    </h3>
                    <div className="mt-auto flex items-center gap-[6px]">
                      <span className="text-[14px] font-bold text-[#1e3a1e] font-sans">
                        {formatPrice(product.node.priceRange.minVariantPrice.amount)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
