-- Adiciona Lalamove como terceiro método de entrega (fallback SJC fora do raio Uber, < 7 marmitas).
-- Expande os CHECK constraints de public.orders de forma idempotente, SEM remover valores existentes.
-- Ver .claude/fluxo-uber-direct.md e decisão de negócio (item 5 do 00-execucao.md).

-- orders.delivery_method: + 'lalamove' (mantém aceitação de NULL para orders pré-feature)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_method_check
  CHECK (delivery_method IS NULL OR delivery_method IN ('uber_direct', 'jilo_own', 'lalamove'));

-- orders.delivery_status: + trio lalamove_* (espelha o trio jilo_* de despacho manual)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_status_check
  CHECK (delivery_status IN (
    'pending_dispatch',
    'uber_pickup_assigned', 'uber_pickup_complete', 'uber_in_transit',
    'uber_dropoff_complete', 'uber_failed',
    'jilo_pending', 'jilo_in_transit', 'jilo_delivered',
    'lalamove_pending', 'lalamove_in_transit', 'lalamove_delivered'
  ));

COMMENT ON COLUMN public.orders.delivery_method IS 'Método de entrega: uber_direct (< 7 itens, cobrado do cliente), jilo_own (>= 7 itens, frete grátis Jilo) ou lalamove (fallback SJC fora do raio Uber, < 7 itens)';
