import { useState } from "react";
import { Menu, Search, User, X } from "lucide-react";
import { CartDrawer } from "@/components/CartDrawer";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

const navLinks = [
  { label: "Cardápio", href: "#cardapio" },
  { label: "Sobre", href: "#sobre" },
  { label: "Assinatura", href: "#kits" },
  { label: "Fale Conosco", href: "#faq" },
];

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b">
      <div className="container mx-auto px-4 flex items-center justify-between h-16 lg:h-20">
        {/* Mobile menu */}
        <div className="lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="p-2"><Menu className="h-5 w-5" /></button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetTitle className="font-serif text-2xl text-primary mb-8">Jilo</SheetTitle>
              <nav className="flex flex-col gap-4">
                {navLinks.map((link) => (
                  <a key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className="text-lg font-medium hover:text-primary transition-colors">
                    {link.label}
                  </a>
                ))}
                <a href="#cardapio" onClick={() => setMobileOpen(false)} className="mt-4 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold">
                  Montar meu Kit
                </a>
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        {/* Logo */}
        <a href="#" className="font-serif text-2xl lg:text-3xl text-primary font-bold tracking-tight">
          Jilo
        </a>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <button className="p-2 hover:opacity-70 transition-opacity hidden sm:block">
            <Search className="h-5 w-5" />
          </button>
          <button className="p-2 hover:opacity-70 transition-opacity hidden sm:block">
            <User className="h-5 w-5" />
          </button>
          <CartDrawer />
          <a href="#cardapio" className="hidden lg:inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors">
            Montar meu Kit
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
