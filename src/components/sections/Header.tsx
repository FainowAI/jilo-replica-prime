import { useState } from "react";
import { Menu, Search, User, X, ChevronDown, ArrowRight } from "lucide-react";
import { CartDrawer } from "@/components/CartDrawer";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

const navLinks = [
  { label: "Cardápio", href: "/cardapio" },
  { label: "Sobre", href: "/#sobre" },
  { label: "Assinatura", href: "/#kits" },
  { label: "Fale Conosco", href: "/#faq" },
];

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

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
                <a href="/#cardapio" onClick={() => setMobileOpen(false)} className="mt-4 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold">
                  Montar meu Kit
                </a>
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        {/* Logo */}
        <a href="/" className="font-serif text-2xl lg:text-3xl text-primary font-bold tracking-tight">
          Jilo
        </a>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-8 relative">

          <div
            className="group relative cursor-pointer py-1"
            onMouseEnter={() => setDropdownOpen(true)}
            onMouseLeave={() => setDropdownOpen(false)}
          >
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors ${dropdownOpen ? 'bg-[#F3F4F0]' : 'hover:bg-[#F3F4F0]/80'}`}>
              <a href="/cardapio" className={`text-sm transition-colors ${dropdownOpen ? 'font-bold text-[#1F3328]' : 'font-medium text-foreground/80'} group-hover:text-[#1F3328]`}>Cardápio</a>
              <ChevronDown className={`w-4 h-4 transition-colors ${dropdownOpen ? 'text-[#1F3328] rotate-180' : 'text-muted-foreground'} group-hover:text-[#1F3328]`} />
            </div>

            {dropdownOpen && (
              <div className="absolute top-full left-0 w-[240px] z-50 pt-1">
                <div className="bg-background border border-border shadow-md shadow-border/20 rounded-2xl p-4 animate-in fade-in slide-in-from-top-4">
                  <div className="text-[10px] uppercase font-bold tracking-widest text-[#B3BDB6] mb-3 font-sans px-2">Categorias</div>
                  <div className="flex flex-col gap-1.5">
                    <a href="/cardapio?category=Aves%20%26%20Suínos" className="block text-sm font-medium text-[#2C4A3A] hover:bg-[#EAF1EC] px-3 py-2.5 rounded-lg transition-colors">Aves & Suínos</a>
                    <a href="/cardapio?category=Bovinos" className="block text-sm font-medium text-[#2C4A3A] hover:bg-[#EAF1EC] px-3 py-2.5 rounded-lg transition-colors">Bovinos</a>
                    <a href="/cardapio?category=Peixes%20%26%20Massas" className="block text-sm font-medium text-[#2C4A3A] hover:bg-[#EAF1EC] px-3 py-2.5 rounded-lg transition-colors">Peixes & Massas</a>
                    <a href="/cardapio?category=Veganos" className="block text-sm font-medium text-[#2C4A3A] hover:bg-[#EAF1EC] px-3 py-2.5 rounded-lg transition-colors">Veganos</a>
                  </div>
                  <div className="h-px bg-border my-4" />
                  <a href="/cardapio" className="text-sm font-bold text-[#1F3328] hover:text-primary px-3 pb-1 flex items-center gap-2 transition-colors group/all">
                    Ver todos os pratos
                    <ArrowRight className="w-4 h-4 inline-flex group-hover/all:translate-x-1 transition-transform" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {navLinks.filter(link => link.label !== "Cardápio").map((link) => (
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
