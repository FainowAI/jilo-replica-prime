/**
 * `vr-public-key` — devolve a chave pública da VR (Captura) para o cliente
 * criptografar os dados do cartão no navegador antes de chamar `vr-checkout`.
 * JWT obrigatório (só para evitar scraping anônimo da chave — a chave em si
 * não é segredo). Nunca loga a chave nem qualquer dado de cartão.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPublicKey } from "../_shared/vr-client.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// ponytail: allowlist = domínio de produção (src/config/site.ts) + localhost (dev). Não há
// padrão de preview do Lovable documentado no repo (grep nas outras functions só encontrou
// "*"); se precisar liberar preview, adicionar o domínio aqui. Auth é bearer sem cookie, então
// CORS é defesa em profundidade, não a barreira principal (achado B4 em security.md).
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

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ code: "method_not_allowed", userMessage: "Método não permitido." }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ code: "unauthorized", userMessage: "Sessão inválida." }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ code: "unauthorized", userMessage: "Sessão inválida." }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const { key_id, public_key } = await getPublicKey();
    return new Response(JSON.stringify({ key_id, public_key }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "private, max-age=300" },
    });
  } catch {
    console.error("[vr-public-key] getPublicKey failed");
    return new Response(
      JSON.stringify({ code: "vr_unavailable", userMessage: "Não foi possível obter a chave da VR agora." }),
      { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
}

serve(handler);
