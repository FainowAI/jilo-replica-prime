// Entrypoint da Edge Function: só liga o servidor. Toda a lógica vive em
// ./handler.ts (testável com deps injetados, sem abrir porta).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildDefaultDeps, handleVrCheckout } from "./handler.ts";

serve((req) => handleVrCheckout(req, buildDefaultDeps()));
