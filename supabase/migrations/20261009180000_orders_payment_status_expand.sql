-- Expande orders.payment_status para cobrir todos os financial_status da Shopify
-- (authorized, partially_paid, partially_refunded, voided, expired). Antes, o upsert do
-- receiver violava o CHECK e falhava em silêncio. Idempotente; NÃO altera orders.status.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN (
    'pending', 'authorized', 'partially_paid', 'paid',
    'partially_refunded', 'refunded', 'voided', 'expired', 'failed'
  ));
