import { supabase } from "@/integrations/supabase/client";

/**
 * Erro estruturado da cotação Uber Direct. Encapsula o `code` da Uber quando
 * disponível, para que o frontend possa renderizar mensagens customizadas
 * (especialmente para `address_undeliverable`).
 */
export class UberQuoteError extends Error {
  /** Code retornado pela Uber (ex: "address_undeliverable"). Null se não foi possível parsear. */
  readonly code: string | null;
  /** Status HTTP retornado pela edge function (502 quando Uber falhou; 500 em erros inesperados). */
  readonly status: number | null;
  /** Mensagem original da Uber, quando disponível. */
  readonly uberMessage: string | null;

  constructor(params: { code: string | null; status: number | null; uberMessage: string | null; message: string }) {
    super(params.message);
    this.name = "UberQuoteError";
    this.code = params.code;
    this.status = params.status;
    this.uberMessage = params.uberMessage;
  }
}

export interface UberQuote {
  quote_id: string;
  fee_cents: number;
  currency: string;
  duration_minutes: number;
  expires_at: string;
  dropoff_eta: string;
}

export interface QuoteParams {
  dropoff_cep: string;
  dropoff_address: string;
  dropoff_city: string;
  dropoff_state: string;
}

export async function fetchUberQuote(params: QuoteParams): Promise<UberQuote> {
  const { data, error } = await supabase.functions.invoke<UberQuote>("uber-quote", {
    body: params,
  });

  if (error) {
    // supabase-js v2 retorna FunctionsHttpError com um `context: Response` quando
    // a edge function responde HTTP >= 400. A nossa edge `uber-quote` retorna 502
    // com payload `{ error, status, detail }` quando a Uber rejeita.
    let code: string | null = null;
    let status: number | null = null;
    let uberMessage: string | null = null;

    try {
      // `context` pode ser um Response ou um objeto serializado, dependendo
      // da versão do supabase-js. Tentamos ambos os formatos.
      const ctx = (error as { context?: unknown }).context;
      let body: unknown = null;

      if (ctx instanceof Response) {
        // Clone porque o body só pode ser lido uma vez.
        body = await ctx.clone().json().catch(() => null);
      } else if (typeof ctx === "object" && ctx !== null) {
        body = ctx;
      }

      if (body && typeof body === "object") {
        const bodyObj = body as { detail?: string; status?: number };
        status = typeof bodyObj.status === "number" ? bodyObj.status : null;

        // O `detail` é o body original da Uber serializado como string JSON.
        // Tenta parsear pra extrair `code` e `message`.
        if (typeof bodyObj.detail === "string") {
          try {
            const uberPayload = JSON.parse(bodyObj.detail) as { code?: string; message?: string };
            code = uberPayload.code ?? null;
            uberMessage = uberPayload.message ?? null;
          } catch {
            // detail não é JSON parseável — ignora silenciosamente
          }
        }
      }
    } catch {
      // Qualquer falha de parse: segue com nulls, deixa o erro genérico
    }

    throw new UberQuoteError({
      code,
      status,
      uberMessage,
      message: uberMessage ?? error.message ?? "Erro na cotação de frete",
    });
  }

  if (!data) throw new Error("Empty response from uber-quote");
  return data;
}

export async function updateShippingVariantPrice(feeCents: number): Promise<void> {
  const { error } = await supabase.functions.invoke("update-shipping-variant-price", {
    body: { fee_cents: feeCents },
  });
  if (error) throw error;
}
