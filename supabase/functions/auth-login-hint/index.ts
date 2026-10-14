/**
 * `auth-login-hint` — DESATIVADA em 13/10 (auditoria M1): o limite em memória não segurava,
 * e a função virou um "oráculo" de quem tem conta Google no Jiló. O site passou a mostrar
 * mensagem fixa para todos. Fica no ar respondendo sempre `{ hint: null }` só para o front
 * antigo (ainda publicado) cair na mensagem genérica sem erro. Apagar depois que o front novo
 * estiver publicado (Painel Supabase > Edge Functions).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = origin === "https://jilomarmitas.com" || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://jilomarmitas.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

serve((req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  return new Response(JSON.stringify({ hint: null }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});
