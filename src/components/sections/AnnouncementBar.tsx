import { CreditCard, Truck, Clock } from "lucide-react";

const AnnouncementBar = () => {
  return (
    <div className="bg-primary text-primary-foreground py-2 px-4 text-center text-xs sm:text-sm font-sans">
      <div className="container mx-auto flex items-center justify-center gap-4 sm:gap-8 flex-wrap">
        <span className="flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5" />
          Aceitamos VA/VR
        </span>
        <span className="hidden sm:inline text-primary-foreground/40">|</span>
        <span className="flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5" />
          Entrega em 48h
        </span>
        <span className="hidden sm:inline text-primary-foreground/40">|</span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          5% OFF no PIX
        </span>
      </div>
    </div>
  );
};

export default AnnouncementBar;
