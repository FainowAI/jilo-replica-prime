import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Minus, Plus, ShoppingCart, Zap } from "lucide-react";
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
import { toast } from "sonner";

const formatPrice = (amount: string) => {
  return `R$ ${parseFloat(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getPixDiscount = (amount: string) => {
  const price = parseFloat(amount);
  return price * 0.95;
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

      <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-[#1E3A1E]/60 mb-8">
          <Link to="/" className="hover:text-[#1E3A1E]">Home</Link>
          <ChevronRight className="w-4 h-4" />
          <Link to={`/colecao/${productData.productType.toLowerCase().replace(/\s+/g, '-')}`} className="hover:text-[#1E3A1E]">
            {productData.productType}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-[#1E3A1E]">{productData.title}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-12 mb-16">
          {/* Image Gallery */}
          <div className="space-y-4">
            <div className="aspect-square rounded-lg overflow-hidden bg-white">
              <img
                src={images[selectedImage]?.url || '/placeholder.svg'}
                alt={images[selectedImage]?.altText || productData.title}
                className="w-full h-full object-cover"
              />
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {images.map((img: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(idx)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      selectedImage === idx ? 'border-[#1E3A1E]' : 'border-transparent'
                    }`}
                  >
                    <img src={img.url} alt={img.altText || ''} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            <div>
              <h1 className="font-['DM_Serif_Display'] text-4xl text-[#1E3A1E] mb-4">
                {productData.title}
              </h1>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-4">
                {productData.tags.map((tag: string) => (
                  <Badge key={tag} variant={getBadgeVariant(tag)} className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>

              {/* Price */}
              <div className="space-y-2">
                <p className="text-3xl font-bold text-[#1E3A1E]">
                  {formatPrice(price)}
                </p>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-green-600" />
                  <span className="text-green-600 font-semibold">
                    {formatPrice(pixPrice.toString())} no Pix (5% OFF)
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            {productData.description && (
              <p className="text-[#1E3A1E]/80 leading-relaxed">
                {productData.description}
              </p>
            )}

            {/* Variant Selector */}
            {productData.variants.edges.length > 1 && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#1E3A1E]">Tamanho:</label>
                <div className="flex gap-2">
                  {productData.variants.edges.map((variant: any) => (
                    <Button
                      key={variant.node.id}
                      variant={selectedVariantId === variant.node.id ? "default" : "outline"}
                      onClick={() => setSelectedVariantId(variant.node.id)}
                      className={selectedVariantId === variant.node.id ? "bg-[#1E3A1E]" : ""}
                      disabled={!variant.node.availableForSale}
                    >
                      {variant.node.title}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#1E3A1E]">Quantidade:</label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="text-xl font-semibold w-12 text-center">{quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button
                className="w-full bg-[#1E3A1E] hover:bg-[#1E3A1E]/90 text-white h-12"
                onClick={handleAddToCart}
                disabled={isLoading || !selectedVariant?.availableForSale}
              >
                <ShoppingCart className="w-5 h-5 mr-2" />
                Adicionar ao Carrinho
              </Button>
              <Button
                variant="outline"
                className="w-full border-[#1E3A1E] text-[#1E3A1E] hover:bg-[#1E3A1E]/5 h-12"
                onClick={handleBuyNow}
                disabled={isLoading || !selectedVariant?.availableForSale}
              >
                Comprar Agora
              </Button>
            </div>

            {/* Ingredients Accordion */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="ingredients">
                <AccordionTrigger className="text-[#1E3A1E] font-semibold">
                  Componentes do prato
                </AccordionTrigger>
                <AccordionContent className="text-[#1E3A1E]/80">
                  <p className="mb-2">Todos os pratos incluem:</p>
                  <p className="leading-relaxed">{getIngredientText(productData.productType)}</p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="mb-16">
            <h2 className="font-['DM_Serif_Display'] text-3xl text-[#1E3A1E] mb-8">
              Você também pode gostar
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.map((product: any) => (
                <Card
                  key={product.node.id}
                  className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => navigate(`/produto/${product.node.handle}`)}
                >
                  <div className="aspect-square overflow-hidden">
                    <img
                      src={product.node.images.edges[0]?.node.url || '/placeholder.svg'}
                      alt={product.node.title}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-[#1E3A1E] mb-2">{product.node.title}</h3>
                    <p className="text-lg font-bold text-[#1E3A1E]">
                      {formatPrice(product.node.priceRange.minVariantPrice.amount)}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
