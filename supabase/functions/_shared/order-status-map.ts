// Mapeia financial_status/cancelled_at da Shopify para orders.status/payment_status.
// payment_status só assume valores aceitos pelo CHECK orders_payment_status_check.
const PAYMENT_STATUSES = new Set([
  "pending", "authorized", "partially_paid", "paid",
  "partially_refunded", "refunded", "voided", "expired", "failed",
]);

export type MappedOrderStatus = {
  status: "pending" | "paid" | "cancelled" | "refunded";
  payment_status: string;
};

export function mapFinancialStatus(
  financial: string | null | undefined,
  cancelledAt?: string | null,
): MappedOrderStatus {
  const payment_status = financial && PAYMENT_STATUSES.has(financial) ? financial : "pending";
  if (cancelledAt) return { status: "cancelled", payment_status };
  switch (payment_status) {
    case "paid":
      return { status: "paid", payment_status };
    case "refunded":
    case "partially_refunded":
      return { status: "refunded", payment_status };
    case "voided":
    case "expired":
      return { status: "cancelled", payment_status };
    default:
      return { status: "pending", payment_status };
  }
}
