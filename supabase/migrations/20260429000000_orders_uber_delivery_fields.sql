-- Campos para suportar entrega via Uber Direct ou Jilo própria
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_method text
    CHECK (delivery_method IN ('uber_direct', 'jilo_own'))
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uber_quote_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uber_delivery_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uber_tracking_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shipping_fee_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_status text
    CHECK (delivery_status IN (
      'pending_dispatch',
      'uber_pickup_assigned',
      'uber_pickup_complete',
      'uber_in_transit',
      'uber_dropoff_complete',
      'uber_failed',
      'jilo_pending',
      'jilo_in_transit',
      'jilo_delivered'
    ))
    DEFAULT 'pending_dispatch';

-- Index para busca rápida no webhook receiver
CREATE INDEX IF NOT EXISTS idx_orders_uber_delivery_id
  ON public.orders (uber_delivery_id)
  WHERE uber_delivery_id IS NOT NULL;

-- Comentários para documentação
COMMENT ON COLUMN public.orders.delivery_method IS 'Método de entrega: uber_direct (< 7 itens, cobrado do cliente) ou jilo_own (>= 7 itens, frete grátis Jilo)';
COMMENT ON COLUMN public.orders.uber_quote_id IS 'ID da cotação Uber Direct usada no checkout (válida por 15min)';
COMMENT ON COLUMN public.orders.uber_delivery_id IS 'ID da entrega criada via Uber Direct API após pagamento confirmado';
COMMENT ON COLUMN public.orders.uber_tracking_url IS 'URL pública de tracking fornecida pela Uber';
COMMENT ON COLUMN public.orders.shipping_fee_cents IS 'Valor do frete cobrado do cliente em centavos. Sempre 0 para jilo_own.';
COMMENT ON COLUMN public.orders.delivery_status IS 'Status detalhado da entrega, atualizado pelo webhook Uber ou manualmente para entregas Jilo';
