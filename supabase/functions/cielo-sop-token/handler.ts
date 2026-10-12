/**
 * `cielo-sop-token` — emite o AccessToken do Silent Order Post (tokeniza o cartão no navegador;
 * o PAN nunca toca o backend, R-A5). Resposta SÓ `{accessToken, environment}`, no-store.
 * Ordem: kill-switch -> CORS/método -> JWT -> allowlist QA (não-prod) -> rate limit -> body -> cart.
 * Nunca logar o token nem o corpo do OAuth.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

import { getCart, type StorefrontCart } from "../_shared/storefront-cart.ts";
import { getCieloEnv, getSopAccessToken, sopEnvironment, type CieloEnv } from "../_shared/cielo-client.ts";
import { buildCorsHeaders, errorResponse, jsonResponse, passesQaGate } from "../_shared/cielo-support.ts";

const Body = z.object({ cartId: z.string().startsWith("gid://shopify/Cart/") }).strict();

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export interface SopTokenDeps {
  getUser(authHeader: string | null): Promise<{ id: string; email: string } | null>;
  getCart(cartId: string): Promise<StorefrontCart | null>;
  getSopAccessToken(): Promise<{ accessToken: string; expiresIn: number }>;
  /** true = pode emitir. */
  allowRate(userId: string, nowMs: number): boolean;
  cieloEnv(): CieloEnv;
  env: { ALELO_ENABLED: string | null; ALELO_QA_EMAILS: string | null };
  now(): Date;
}

// ponytail: contador em memória por instância da edge — suficiente contra loop acidental;
// abuso real (várias instâncias) exigiria contador no banco.
const hits = new Map<string, number[]>();
export function memoryRateLimit(userId: string, nowMs: number): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => nowMs - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(nowMs);
  hits.set(userId, recent);
  return true;
}

export async function handleSopToken(req: Request, deps: SopTokenDeps): Promise<Response> {
  const cors = buildCorsHeaders(req);
  if (deps.env.ALELO_ENABLED !== "true") return errorResponse("not_found", "Não encontrado.", 404, cors);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", "Método não permitido.", 405, cors);

  const user = await deps.getUser(req.headers.get("Authorization"));
  if (!user) return errorResponse("unauthorized", "Sessão inválida. Faça login novamente.", 401, cors);

  let env: CieloEnv;
  try {
    env = deps.cieloEnv();
  } catch {
    return errorResponse("alelo_unavailable", "Pagamento com Alelo indisponível.", 503, cors);
  }
  if (!passesQaGate(env, user.email, deps.env.ALELO_QA_EMAILS)) {
    return errorResponse("forbidden", "Acesso negado.", 403, cors);
  }
  if (!deps.allowRate(user.id, deps.now().getTime())) {
    return errorResponse("too_many_attempts", "Muitas tentativas. Aguarde um instante.", 429, cors);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse("invalid_body", "Requisição inválida.", 400, cors);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return errorResponse("invalid_body", "Requisição inválida.", 400, cors);

  const cart = await deps.getCart(parsed.data.cartId);
  if (!cart || cart.lines.length === 0) return errorResponse("cart_not_found", "Carrinho não encontrado.", 422, cors);

  try {
    const { accessToken } = await deps.getSopAccessToken();
    return jsonResponse({ accessToken, environment: sopEnvironment(env) }, 200, cors, {
      "Cache-Control": "no-store",
    });
  } catch {
    console.error("[cielo-sop-token] token failed");
    return errorResponse("alelo_unavailable", "Não foi possível iniciar o pagamento com Alelo agora.", 502, cors);
  }
}

export function buildDefaultDeps(): SopTokenDeps {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  return {
    async getUser(authHeader) {
      if (!authHeader) return null;
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      if (error || !user || !user.email) return null;
      return { id: user.id, email: user.email };
    },
    getCart,
    getSopAccessToken,
    allowRate: memoryRateLimit,
    cieloEnv: getCieloEnv,
    env: {
      ALELO_ENABLED: Deno.env.get("ALELO_ENABLED") ?? null,
      ALELO_QA_EMAILS: Deno.env.get("ALELO_QA_EMAILS") ?? null,
    },
    now: () => new Date(),
  };
}
