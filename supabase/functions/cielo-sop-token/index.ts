import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildDefaultDeps, handleSopToken } from "./handler.ts";

serve((req) => handleSopToken(req, buildDefaultDeps()));
