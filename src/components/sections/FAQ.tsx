import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MessageCircle } from "lucide-react";

const faqs = [
  { q: "Como funciona o congelamento?", a: "Nossos pratos são congelados logo após o preparo, utilizando o método de ultra-congelamento que preserva sabor, textura e nutrientes por até 90 dias." },
  { q: "Qual o prazo de entrega?", a: "Entregamos diariamente entre 18h e 23h. O prazo é de 48h após a confirmação do pedido — pedidos feitos até meia-noite são entregues no segundo dia seguinte. Você não escolhe o dia: ao confirmar, você recebe automaticamente a data prevista de entrega." },
  { q: "Quanto custa o frete?", a: "O frete é grátis — cortesia Jilo para toda região atendida. Verifique no carrinho se entregamos no seu CEP." },
  { q: "Quais as formas de pagamento?", a: "Aceitamos Pix, cartão de crédito e PayPal. As opções estarão disponíveis no momento do checkout." },
  { q: "Os pratos contêm conservantes?", a: "Não. Nossos pratos são 100% livres de conservantes artificiais. Usamos apenas o congelamento como método de conservação natural." },
  { q: "Como aquecer os pratos?", a: "Micro-ondas: retire a tampa, aqueça por 4-6 minutos. Forno: transfira para refratário, cubra com papel alumínio e aqueça por 20 minutos a 180°C." },
  { q: "Posso cancelar minha assinatura?", a: "Sim, você pode cancelar ou pausar sua assinatura a qualquer momento, sem multa. Basta entrar em contato pelo WhatsApp ou e-mail." },
];

export const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const FAQ = () => {
  return (
    <section id="faq" className="py-16 lg:py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-accent text-xs uppercase tracking-widest font-semibold mb-2 font-sans">Dúvidas</p>
            <h2 className="text-3xl lg:text-4xl">Perguntas Frequentes</h2>
          </div>
          <Accordion type="single" collapsible defaultValue="item-0" className="space-y-3">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border rounded-xl px-5 data-[state=open]:bg-card">
                <AccordionTrigger className="text-left font-sans font-semibold text-sm hover:no-underline py-5">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="font-sans text-muted-foreground text-sm leading-relaxed pb-5">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="text-center mt-10">
            <a
              href="https://wa.me/5512988950426"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[hsl(142,70%,40%)] text-white px-8 py-3 text-sm font-semibold font-sans hover:opacity-90 transition-opacity"
            >
              <MessageCircle className="h-4 w-4" />
              Falar no WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
