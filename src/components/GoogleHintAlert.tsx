import { Alert, AlertDescription } from "@/components/ui/alert";

/** Aviso exibido logo acima do botão Google (ponytail: adjacente ao botão, sem scroll). */
const GoogleHintAlert = ({ message }: { message: string | null }) =>
  message ? (
    <Alert className="mb-4 border-[#1e3a1e]/40 bg-[#1e3a1e]/5 text-[#1e3a1e] font-sans">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : null;

export default GoogleHintAlert;
