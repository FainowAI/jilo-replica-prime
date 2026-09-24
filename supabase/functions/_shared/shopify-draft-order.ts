/**
 * Draft orders da Admin API para o pagamento VR (ticket 03): cria o draft
 * ANTES de cobrar (auditoria A1), assert de total é feito pelo chamador
 * (`vr-checkout`) comparando `totalPriceCents` com o valor lido do cart.
 *
 * Descontos: nunca copiamos `discountCodes` do cart (só valores) — auditoria
 * A2. TODAS as alocações do cart (Kit por linha + PIX5/cupom por ordem) viram
 * UM `appliedDiscount` FIXED_AMOUNT de ordem: medido em 2026-09-14 via
 * `draftOrderCalculate` que o FIXED_AMOUNT por linha é POR UNIDADE (6,93 × 7
 * = 48,51), e dividir por unidade quebra no arredondamento (ex.: 1,00 / 3).
 * Um único valor de ordem é exato por construção. `customAttributes` levam
 * só IDs, nunca PII (R65/D2).
 *
 * ponytail: `customerId` é mapeado via `purchasingEntity` (campo atual da
 * Admin API para associar cliente a um draft order; `DraftOrderInput.customerId`
 * direto está deprecado em versões recentes). A CONFIRMAR ao vivo no primeiro
 * deploy contra a API version real da loja — se `purchasingEntity` não for
 * aceito nessa versão, trocar por `customerId` direto no `draftInput`.
 */
import { callShopifyAdmin } from "./shopify-admin-client.ts";

export interface DraftOrderAddress {
  firstName?: string;
  lastName?: string;
  address1: string;
  address2?: string;
  city: string;
  provinceCode: string;
  zip: string;
  countryCode: "BR";
  phone?: string;
}

export interface DraftOrderInput {
  email: string;
  customerId?: string | null; // gid://shopify/Customer/…
  lines: Array<{ variantId: string; quantity: number }>;
  /** Soma de TODAS as alocações do cart (linha + ordem), em centavos. */
  discountCents?: number;
  discountTitle?: string;
  shippingAddress: DraftOrderAddress;
  tags: string[];
  customAttributes: Record<string, string>;
}

// `DraftOrderAppliedDiscountInput.value` e `Float!` na Admin API — mandar string
// ("6.93") derruba a mutation com erro de schema (achado no E2E de 2026-09-14).
function centsToFloat(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function centsFromAmount(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

// ---------------------------------------------------------------------------
// draftOrderCreate
// ---------------------------------------------------------------------------

const DRAFT_ORDER_CREATE_MUTATION = `
  mutation DraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        totalPriceSet { shopMoney { amount } }
      }
      userErrors { field message }
    }
  }
`;

interface DraftOrderCreateResponse {
  draftOrderCreate?: {
    draftOrder?: { id: string; totalPriceSet: { shopMoney: { amount: string } } } | null;
    userErrors?: { field?: string[]; message: string }[];
  };
}

export async function createDraftOrder(input: DraftOrderInput): Promise<{ id: string; totalPriceCents: number }> {
  const lineItems = input.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity }));

  const draftInput: Record<string, unknown> = {
    email: input.email,
    lineItems,
    // Os descontos ja vem copiados do cart como um valor fixo de ordem; sem isto a Shopify
    // aplicaria o automatic discount "Kit" de novo por cima e o total do draft nao bateria
    // com o valor cobrado (assert em vr-checkout).
    acceptAutomaticDiscounts: false,
    shippingAddress: input.shippingAddress,
    tags: input.tags,
    customAttributes: Object.entries(input.customAttributes).map(([key, value]) => ({ key, value })),
  };
  if (input.customerId) {
    draftInput.purchasingEntity = { customerId: input.customerId };
  }
  if (input.discountCents && input.discountCents > 0) {
    draftInput.appliedDiscount = {
      value: centsToFloat(input.discountCents),
      valueType: "FIXED_AMOUNT",
      title: input.discountTitle ?? "Desconto",
    };
  }

  const data = await callShopifyAdmin<DraftOrderCreateResponse>(DRAFT_ORDER_CREATE_MUTATION, { input: draftInput });
  const userErrors = data.draftOrderCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    console.error(`[shopify-draft-order] draftOrderCreate userErrors (${userErrors.length})`);
    throw new Error("draft_order_create_failed");
  }
  const draftOrder = data.draftOrderCreate?.draftOrder;
  if (!draftOrder) {
    throw new Error("draft_order_create_failed");
  }
  return { id: draftOrder.id, totalPriceCents: centsFromAmount(draftOrder.totalPriceSet.shopMoney.amount) };
}

// ---------------------------------------------------------------------------
// draftOrderComplete
// ---------------------------------------------------------------------------

const DRAFT_ORDER_COMPLETE_MUTATION = `
  mutation DraftOrderComplete($id: ID!, $paymentPending: Boolean) {
    draftOrderComplete(id: $id, paymentPending: $paymentPending) {
      draftOrder {
        order { id name }
      }
      userErrors { field message }
    }
  }
`;

interface DraftOrderCompleteResponse {
  draftOrderComplete?: {
    draftOrder?: { order?: { id: string; name: string } | null } | null;
    userErrors?: { field?: string[]; message: string }[];
  };
}

/** paymentPending:false — só deve ser chamado com `vr_codigo_retorno='00'` já gravado (guard no vr-checkout). */
export async function completeDraftOrder(draftId: string): Promise<{ orderId: string; orderName: string }> {
  const data = await callShopifyAdmin<DraftOrderCompleteResponse>(DRAFT_ORDER_COMPLETE_MUTATION, {
    id: draftId,
    paymentPending: false,
  });
  const userErrors = data.draftOrderComplete?.userErrors ?? [];
  if (userErrors.length > 0) {
    console.error(`[shopify-draft-order] draftOrderComplete userErrors (${userErrors.length})`);
    throw new Error("draft_order_complete_failed");
  }
  const order = data.draftOrderComplete?.draftOrder?.order;
  if (!order) {
    throw new Error("draft_order_complete_failed");
  }
  return { orderId: order.id, orderName: order.name };
}

// ---------------------------------------------------------------------------
// draftOrderDelete
// ---------------------------------------------------------------------------

const DRAFT_ORDER_DELETE_MUTATION = `
  mutation DraftOrderDelete($input: DraftOrderDeleteInput!) {
    draftOrderDelete(input: $input) {
      deletedId
      userErrors { field message }
    }
  }
`;

interface DraftOrderDeleteResponse {
  draftOrderDelete?: {
    deletedId?: string | null;
    userErrors?: { field?: string[]; message: string }[];
  };
}

/** Best-effort: nunca lança. Um draft órfão na Shopify é inofensivo (sem cobrança associada). */
export async function deleteDraftOrder(draftId: string): Promise<void> {
  try {
    const data = await callShopifyAdmin<DraftOrderDeleteResponse>(DRAFT_ORDER_DELETE_MUTATION, {
      input: { id: draftId },
    });
    const userErrors = data.draftOrderDelete?.userErrors ?? [];
    if (userErrors.length > 0) {
      console.error(`[shopify-draft-order] draftOrderDelete userErrors (${userErrors.length})`);
    }
  } catch {
    console.error("[shopify-draft-order] deleteDraftOrder failed (best-effort, ignorado)");
  }
}
