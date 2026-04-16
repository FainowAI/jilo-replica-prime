import { NavLink } from "react-router-dom";
import { UserCircle2, Package, MapPin, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { to: "/conta/perfil", label: "Meu perfil", icon: UserCircle2 },
  { to: "/conta/pedidos", label: "Meus pedidos", icon: Package },
  { to: "/conta/enderecos", label: "Endereços", icon: MapPin },
];

const ContaSidebar = () => {
  const { user, signOut } = useAuth();

  return (
    <aside className="w-full lg:w-64 flex-shrink-0">
      <div className="bg-white rounded-2xl border border-[#e8e8e4] p-4 lg:sticky lg:top-24">
        <div className="px-3 py-2 mb-2">
          <p className="text-xs text-[#9b9b9b] font-sans">Logada(o) como</p>
          <p className="text-sm font-semibold text-[#1a1a1a] font-sans truncate">{user?.email}</p>
        </div>
        <div className="h-px bg-[#e8e8e4] mb-2" />
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans font-medium transition-colors ${
                  isActive ? "bg-[#1e3a1e] text-white" : "text-[#1a1a1a] hover:bg-[#f0efeb]"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans font-medium text-[#9b9b9b] hover:bg-[#f0efeb] transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </nav>
      </div>
    </aside>
  );
};

export default ContaSidebar;
