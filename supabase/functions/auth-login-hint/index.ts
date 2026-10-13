/**
 * `auth-login-hint` — diz ao front se um e-mail pertence a uma conta Google
 * ('google' = tem provedor Google, com ou sem senha; null = nenhum/erro/limite).
 * Pública (verify_jwt = false): é chamada ANTES do login. Fail-soft: qualquer erro => { hint: null }.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ponytail: rate limit em memória por instância; mover para tabela/Upstash se houver abuso
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const MIN_RESPONSE_MS = 300; // piso de latência: não vazar existência pelo tempo de resposta
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] >= WINDOW_MS) hits.delete(k);
  return recent.length > MAX_PER_WINDOW;
}

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

async function handler(req: Request): Promise<Response> {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const started = Date.now();
  const reply = async (hint: "google" | null) => {
    const wait = MIN_RESPONSE_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return new Response(JSON.stringify({ hint }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  };

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (rateLimited(ip)) return await reply(null);

    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) return await reply(null);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await supabase.rpc("auth_email_login_hint", { p_email: email });
    if (error) throw error;
    return await reply(data === "google" ? "google" : null);
  } catch (err) {
    console.error("[auth-login-hint] falhou:", err instanceof Error ? err.message : "erro");
    return await reply(null);
  }
}

serve(handler);
