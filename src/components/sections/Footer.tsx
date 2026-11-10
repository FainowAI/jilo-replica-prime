import { Instagram } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 py-12 lg:py-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Logo & socials */}
          <div className="col-span-2 lg:col-span-1">
            <p className="font-serif text-2xl font-bold mb-4">Jilo</p>
            <p className="text-primary-foreground/60 text-sm font-sans mb-6 max-w-xs">
              Comida de verdade, congelada com carinho. Para sua semana sem improviso.
            </p>
            <div className="flex gap-3">
              <a href="https://www.instagram.com/jilomarmitas/" target="_blank" rel="noopener noreferrer" aria-label="Jilo no Instagram" className="w-9 h-9 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors">
                <Instagram className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Cardápio */}
          <div>
            <h4 className="font-sans font-semibold text-sm mb-4">Cardápio</h4>
            <ul className="space-y-2.5 text-sm text-primary-foreground/60 font-sans">
              <li><a href="#cardapio" className="hover:text-primary-foreground transition-colors">Aves & Suínos</a></li>
              <li><a href="#cardapio" className="hover:text-primary-foreground transition-colors">Bovinos</a></li>
              <li><a href="#cardapio" className="hover:text-primary-foreground transition-colors">Peixes & Massas</a></li>
              <li><a href="#cardapio" className="hover:text-primary-foreground transition-colors">Veganos</a></li>
            </ul>
          </div>

          {/* Kits */}
          <div>
            <h4 className="font-sans font-semibold text-sm mb-4">Kits</h4>
            <ul className="space-y-2.5 text-sm text-primary-foreground/60 font-sans">
              <li><Link to="/kit/kit-leveza" className="hover:text-primary-foreground transition-colors">Kit Leveza</Link></li>
              <li><Link to="/kit/kit-sabor" className="hover:text-primary-foreground transition-colors">Kit Sabor</Link></li>
              <li><Link to="/kit/kit-forca" className="hover:text-primary-foreground transition-colors">Kit Força</Link></li>
              <li><Link to="/kit/kit-verde" className="hover:text-primary-foreground transition-colors">Kit Verde</Link></li>
              <li><Link to="/kit-livre" className="hover:text-primary-foreground transition-colors">Kit Livre</Link></li>
            </ul>
          </div>

          {/* Atendimento */}
          <div>
            <h4 className="font-sans font-semibold text-sm mb-4">Atendimento</h4>
            <ul className="space-y-2.5 text-sm text-primary-foreground/60 font-sans">
              <li><a href="#faq" className="hover:text-primary-foreground transition-colors">FAQ</a></li>
              <li><a href="https://wa.me/5512978130583" target="_blank" rel="noopener noreferrer" className="hover:text-primary-foreground transition-colors">WhatsApp</a></li>
            </ul>
          </div>
        </div>
      </div>
      {/* Dados da empresa: a Cielo exige CNPJ, telefone comercial e endereço da loja física visíveis na URL de produção (10/11/2026). */}
      <div className="border-t border-primary-foreground/10">
        <div className="container mx-auto px-4 py-4 flex flex-col gap-2 text-xs text-primary-foreground/40 font-sans text-center sm:text-left">
          <address className="not-italic space-y-1">
            <p>Jilo Alimentação Ltda · CNPJ: 05.574.020/0001-90</p>
            <p>Av. Engenheiro Juarez de Siqueira Britto Wanderley, 50, Loja 05 · Eldorado · São José dos Campos/SP · CEP 12238-565</p>
            <p>
              Telefone comercial:{" "}
              <a href="tel:+5512978130583" className="hover:text-primary-foreground transition-colors">(12) 97813-0583</a>
            </p>
          </address>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <p>© 2026 Jilo. Todos os direitos reservados.</p>
            <p>DaJu Alimentação · CNPJ: 39.659.013/0001-02</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
