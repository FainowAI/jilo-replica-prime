import { Instagram, Facebook } from "lucide-react";

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
              <a href="#" className="w-9 h-9 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors">
                <Instagram className="h-4 w-4" />
              </a>
              <a href="#" className="w-9 h-9 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors">
                <Facebook className="h-4 w-4" />
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
              <li><a href="#kits" className="hover:text-primary-foreground transition-colors">Kit Semana Leve</a></li>
              <li><a href="#kits" className="hover:text-primary-foreground transition-colors">Kit Família</a></li>
              <li><a href="#kits" className="hover:text-primary-foreground transition-colors">Kit Fitness</a></li>
              <li><a href="#kits" className="hover:text-primary-foreground transition-colors">Kit Vegano</a></li>
            </ul>
          </div>

          {/* Atendimento */}
          <div>
            <h4 className="font-sans font-semibold text-sm mb-4">Atendimento</h4>
            <ul className="space-y-2.5 text-sm text-primary-foreground/60 font-sans">
              <li><a href="#faq" className="hover:text-primary-foreground transition-colors">FAQ</a></li>
              <li><a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer" className="hover:text-primary-foreground transition-colors">WhatsApp</a></li>
              <li><a href="mailto:contato@jilo.com.br" className="hover:text-primary-foreground transition-colors">contato@jilo.com.br</a></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-primary-foreground/10">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-primary-foreground/40 font-sans">
          <p>© 2024 Jilo. Todos os direitos reservados.</p>
          <p>CNPJ: 00.000.000/0001-00</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
