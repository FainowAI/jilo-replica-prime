/**
 * Resolve a forma de pagamento persistida no espelho a partir de tags confiáveis
 * criadas pelo backend/Shopify. Tags têm precedência sobre o nome do gateway,
 * pois pedidos de fluxos próprios podem não ter gateway nativo.
 */
export function resolveOrderPaymentMethod(tagsInput: unknown, paymentGatewayNames: unknown): string | null {
  const tags = String(tagsInput ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase());

  if (tags.includes("vr")) return "vr";
  if (tags.includes("alelo")) return "alelo";
  if (tags.includes("getnet-pix")) return "getnet-pix";

  return Array.isArray(paymentGatewayNames) && typeof paymentGatewayNames[0] === "string"
    ? paymentGatewayNames[0]
    : null;
}
