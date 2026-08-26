import { MessageCircle } from "lucide-react";

const WhatsAppFloatingButton = () => {
  return (
    <a
      href="https://wa.me/5512988950426"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a Jilo pelo WhatsApp"
      title="Falar com a Jilo pelo WhatsApp"
      className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 sm:right-6"
    >
      <MessageCircle className="h-7 w-7" aria-hidden="true" />
    </a>
  );
};

export default WhatsAppFloatingButton;
