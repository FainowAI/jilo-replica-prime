import { CreditCard, Truck, Clock } from "lucide-react";

const AnnouncementBar = () => {
  return (
    <div className="bg-primary text-primary-foreground py-2 px-4 text-center text-xs sm:text-sm font-sans">
      <div className="container mx-auto flex items-center justify-center gap-4 sm:gap-8 flex-wrap">
        <span className="flex items-center gap-1.5 font-medium">
          🎉 Aceitamos VA/VR · Entrega em 48h gelado e selad
        </span>
      </div>
    </div>
  );
};

export default AnnouncementBar;
