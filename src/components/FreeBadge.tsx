import { Truck } from "lucide-react";

interface FreeBadgeProps {
  size?: "sm" | "md";
  className?: string;
}

const FreeBadge = ({ size = "sm", className = "" }: FreeBadgeProps) => {
  const sizes = {
    sm: "text-[11px] px-2.5 py-1 gap-1",
    md: "text-[13px] px-3 py-1.5 gap-1.5",
  };
  return (
    <span className={`inline-flex items-center bg-[#1e3a1e]/10 text-[#1e3a1e] rounded-full font-sans font-semibold ${sizes[size]} ${className}`}>
      <Truck className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      Entrega grátis em até 48h
    </span>
  );
};

export default FreeBadge;
