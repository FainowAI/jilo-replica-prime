import { supabase } from "@/integrations/supabase/client";
/** Dados do cartão VR digitados no dialog. `data_expiracao` em AAMM; `documento` = CPF (só dígitos). */
export interface VrCardPlain {
  nome: string;
  numero_cartao: string;
  data_expiracao: string;
  cvv: string;
  documento: string;
}

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

export async function payWithVr(
  input: VrCheckoutInput,
  card: VrCardPlain,
): Promise<{ orderName: string; orderId: string }> {
  // A VR recomendou cartão tokenizado (15/10/2026): o servidor tokeniza, paga com o token e o
  // apaga. O cartão viaja só por TLS até a edge e nunca é salvo nem logado (decisão do dono, 21/10).
  // `card.documento` é o CPF validado no dialog; vira o CPF do comprador no draft order.
  const { documento, ...cardData } = card;
  const { data, error } = await supabase.functions.invoke<{ orderName: string; orderId: string }>("vr-checkout", {
    body: { ...input, card: cardData, cpf: documento },
  });

  if (error) {
    const body = await readErrorBody(error);
    const code = body.code ?? "vr_error";
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
