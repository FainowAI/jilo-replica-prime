import { supabase } from "@/integrations/supabase/client";
import type { VrCheckoutInput } from "@/lib/vr/client";

// ponytail: mesmo input do VR (cartId/endereço/entrega) — o CPF e o token vão à parte.
export type AleloCheckoutInput = VrCheckoutInput;

export interface AleloPayInput {
  cpf: string;
  holderName: string;
  paymentToken: string;
}

export interface SopToken {
  accessToken: string;
  environment: string;
}

/** Erro estruturado das edges Alelo/Cielo (`{ code, message }`). */
export class AleloCheckoutError extends Error {
  readonly status: number;
  readonly code: string;
  readonly userMessage: string;
  /** 202 payment_pending: cobrança pode ter ocorrido — NÃO limpar o carrinho nem deixar pagar de novo. */
  readonly pending: boolean;

  constructor(p: { status: number; code: string; userMessage: string; pending?: boolean }) {
    super(p.userMessage);
    this.name = "AleloCheckoutError";
    this.status = p.status;
    this.code = p.code;
    this.userMessage = p.userMessage;
    this.pending = p.pending ?? false;
  }
}

export const GENERIC_ERROR_MESSAGE = "Não foi possível processar o pagamento. Tente novamente.";
export const PENDING_MESSAGE = "Pagamento em processamento. Não pague de novo; vamos confirmar em instantes.";

type ErrBody = { code?: string; message?: string };

async function readErrorBody(error: unknown): Promise<ErrBody> {
  try {
    const ctx = (error as { context?: unknown })?.context;
    if (ctx instanceof Response) {
      const body = await ctx.clone().json().catch(() => null);
      if (body && typeof body === "object") return body as ErrBody;
    } else if (typeof ctx === "object" && ctx !== null) {
      return ctx as ErrBody;
    }
  } catch {
    // corpo não parseável: cai no fallback genérico
  }
  return {};
}

function statusOf(error: unknown): number {
  const ctx = (error as { context?: unknown })?.context;
  return ctx instanceof Response ? ctx.status : 0;
}

async function toError(error: unknown, fallbackCode: string): Promise<AleloCheckoutError> {
  const body = await readErrorBody(error);
  return new AleloCheckoutError({
    status: statusOf(error),
    code: body.code ?? fallbackCode,
    userMessage: body.message ?? GENERIC_ERROR_MESSAGE,
  });
}

export async function getSopToken(cartId: string): Promise<SopToken> {
  const { data, error } = await supabase.functions.invoke<SopToken>("cielo-sop-token", { body: { cartId } });
  if (error) throw await toError(error, "alelo_error");
  if (!data?.accessToken || !data.environment) {
    throw new AleloCheckoutError({ status: 200, code: "bad_response", userMessage: GENERIC_ERROR_MESSAGE });
  }
  return data;
}

export async function payWithAlelo(
  input: AleloCheckoutInput,
  pay: AleloPayInput,
): Promise<{ orderName: string; orderId: string }> {
  const { data, error } = await supabase.functions.invoke<{ orderName?: string; orderId?: string; code?: string }>(
    "cielo-checkout",
    {
      body: {
        cartId: input.cartId,
        addressId: input.selectedAddressId,
        deliveryMethod: input.deliveryMethod,
        cpf: pay.cpf,
        holderName: pay.holderName,
        paymentToken: pay.paymentToken,
      },
    },
  );

  if (error) throw await toError(error, "alelo_error");

  // 202 não é erro para o supabase-js: chega em `data` sem orderName.
  if (data?.code === "payment_pending") {
    throw new AleloCheckoutError({ status: 202, code: "payment_pending", userMessage: PENDING_MESSAGE, pending: true });
  }
  if (!data?.orderName || !data.orderId) {
    throw new AleloCheckoutError({ status: 200, code: "bad_response", userMessage: GENERIC_ERROR_MESSAGE });
  }
  return { orderName: data.orderName, orderId: data.orderId };
}
