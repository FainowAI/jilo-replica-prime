import { supabase } from "@/integrations/supabase/client";
import { encryptCard, type VrCardPlain } from "@/lib/vr/rsa";

export type { VrCardPlain };

export interface VrCheckoutInput {
  cartId: string;
  selectedAddressId: string;
  deliveryMethod: "uber_direct" | "jilo_own" | "lalamove";
  uberQuoteId?: string;
  deliveryLabel?: string;
}

/**
 * Erro estruturado do checkout VR. Body de erro do backend é sempre
 * `{ code, userMessage }` (mais `classe` em `declined`).
 */
export class VrCheckoutError extends Error {
  readonly status: number;
  readonly code: string;
  readonly classe?: string;
  readonly userMessage: string;

  constructor(params: { status: number; code: string; classe?: string; userMessage: string }) {
    super(params.userMessage);
    this.name = "VrCheckoutError";
    this.status = params.status;
    this.code = params.code;
    this.classe = params.classe;
    this.userMessage = params.userMessage;
  }
}

interface VrPublicKey {
  key_id: string;
  public_key: string;
}

const PUBLIC_KEY_TTL_MS = 10 * 60 * 1000;

// ponytail: cache em variável de módulo (nunca storage) — dado sensível de
// sessão de checkout, não precisa sobreviver a reload.
let publicKeyCache: (VrPublicKey & { fetchedAt: number }) | null = null;

const GENERIC_ERROR_MESSAGE = "Não foi possível processar o pagamento. Tente novamente.";

/** Lê o body de erro de um FunctionsHttpError do supabase-js v2 (context: Response). */
async function readErrorBody(error: unknown): Promise<{ code?: string; classe?: string; userMessage?: string }> {
  try {
    const ctx = (error as { context?: unknown })?.context;
    if (ctx instanceof Response) {
      const body = await ctx.clone().json().catch(() => null);
      if (body && typeof body === "object") return body as { code?: string; classe?: string; userMessage?: string };
    } else if (typeof ctx === "object" && ctx !== null) {
      return ctx as { code?: string; classe?: string; userMessage?: string };
    }
  } catch {
    // corpo não parseável: segue com objeto vazio, cai no fallback genérico
  }
  return {};
}

function statusOf(error: unknown): number {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) return ctx.status;
  return 0;
}

export async function getVrPublicKey(): Promise<VrPublicKey> {
  const now = Date.now();
  if (publicKeyCache && now - publicKeyCache.fetchedAt < PUBLIC_KEY_TTL_MS) {
    return { key_id: publicKeyCache.key_id, public_key: publicKeyCache.public_key };
  }

  const { data, error } = await supabase.functions.invoke<VrPublicKey>("vr-public-key", { body: {} });
  if (error) {
    const body = await readErrorBody(error);
    throw new VrCheckoutError({
      status: statusOf(error),
      code: body.code ?? "vr_error",
      userMessage: body.userMessage ?? GENERIC_ERROR_MESSAGE,
    });
  }
  if (!data) {
    throw new VrCheckoutError({ status: 0, code: "bad_response", userMessage: GENERIC_ERROR_MESSAGE });
  }

  publicKeyCache = { ...data, fetchedAt: now };
  return { key_id: data.key_id, public_key: data.public_key };
}

export function invalidateVrPublicKey(): void {
  publicKeyCache = null;
}

export async function payWithVr(
  input: VrCheckoutInput,
  card: VrCardPlain,
): Promise<{ orderName: string; orderId: string }> {
  const { key_id: keyId, public_key: publicKey } = await getVrPublicKey();
  const cardEncrypted = await encryptCard(publicKey, card);

  const { data, error } = await supabase.functions.invoke<{ orderName: string; orderId: string }>("vr-checkout", {
    body: { ...input, keyId, cardEncrypted },
  });

  if (error) {
    const body = await readErrorBody(error);
    const code = body.code ?? "vr_error";
    if (code === "vr_error" || code === "vr_unavailable") {
      invalidateVrPublicKey();
    }
    throw new VrCheckoutError({
      status: statusOf(error),
      code,
      classe: body.classe,
      userMessage: body.userMessage ?? GENERIC_ERROR_MESSAGE,
    });
  }

  if (!data || !data.orderName) {
    throw new VrCheckoutError({ status: 200, code: "bad_response", userMessage: GENERIC_ERROR_MESSAGE });
  }

  return data;
}
