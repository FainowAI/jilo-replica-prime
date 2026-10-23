-- ============================================
-- Migration: getnet_callbacks — cada callback (GET) recebido da Getnet na edge `getnet-callback`
-- Data: 2026-10-13
-- Origem: .claude/.work/getnet-callback/tickets/_map.md (tabela) + security.md (S-03, S-05.3, S-08, S-09, S-15).
--         Molde: 20261012210527_cielo_transactions.sql.
-- Regras:
--   - Tabela SÓ DE BACKEND (service_role ignora RLS). Policy única deny-all com TO explícito.
--   - Sem PII: só ids opacos (payment_id Getnet, order_id = paymentId Shopify) e centavos.
--     NUNCA guardar a query string crua, URL, e-mail, CPF, endereço ou corpo de resposta.
--   - Idempotência: UNIQUE (getnet_payment_id, status_getnet) — a Getnet reenvia; INSERT primeiro, 23505 = já recebido.
--   - Sem RPC/função nova em public (S-09): claim por lease via UPDATE condicional em locked_until.
--   - Retenção: NÃO apagar linhas com menos de 90 dias (S-15) — o dedupe e a detecção de estorno dependem da linha existir.
-- ============================================

create table if not exists public.getnet_callbacks (
  id                    uuid primary key default gen_random_uuid(),
  getnet_payment_id     text not null,
  shopify_payment_id    text not null,                              -- = order_id do callback
  payment_type          text not null check (payment_type in ('credit', 'pix')),
  status_getnet         text not null,                              -- normalizado em MAIÚSCULAS
  amount_cents          integer not null check (amount_cents > 0),
  state                 text not null default 'received'
                          check (state in ('received', 'pending', 'done', 'needs_review', 'ignored', 'error')),
  attempts              integer not null default 0,
  locked_until          timestamptz,                                -- lease do reconcile (S-09)
  shopify_order_id      text,
  shopify_order_name    text,
  abandoned_checkout_id text,                                       -- ticket 03
  marker_draft_id       text,                                       -- ticket 04
  alerted_at            timestamptz,                                -- ticket 04
  error                 text,                                       -- código interno, sem PII
  forwarded_at          timestamptz,
  received_at           timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint getnet_callbacks_payment_status_key unique (getnet_payment_id, status_getnet)
);

comment on table public.getnet_callbacks is
  'Callbacks da Getnet (cartão/Pix). Só backend (service_role). Sem PII. Reter >= 90 dias (dedupe e estorno dependem da linha).';
comment on column public.getnet_callbacks.error is
  'Código interno (payment_id_mismatch, above_cap, outside_recency, breaker_open, dry_run, ...). Nunca corpo de resposta.';

alter table public.getnet_callbacks enable row level security;
revoke all on public.getnet_callbacks from anon, authenticated;

drop policy if exists "Deny anon and authenticated on getnet_callbacks" on public.getnet_callbacks;
create policy "Deny anon and authenticated on getnet_callbacks"
  on public.getnet_callbacks for all
  to anon, authenticated
  using (false)
  with check (false);

-- S-05.3: um abandoned checkout só pode ser consumido por UMA linha (garantia no banco, não no código).
create unique index if not exists getnet_callbacks_abandoned_checkout_unique
  on public.getnet_callbacks (abandoned_checkout_id)
  where abandoned_checkout_id is not null;

-- Varredura do reconcile (ticket 02): attempts asc, received_at asc.
create index if not exists getnet_callbacks_pending_scan
  on public.getnet_callbacks (state, attempts, received_at)
  where state in ('received', 'pending');

drop trigger if exists getnet_callbacks_updated_at on public.getnet_callbacks;
create trigger getnet_callbacks_updated_at
  before update on public.getnet_callbacks
  for each row execute function public.update_updated_at_column();

-- Heartbeat do reconcile (S-10): uma linha só (id = 1); o ticket 02 faz upsert de last_reconcile_at.
create table if not exists public.getnet_callback_heartbeat (
  id                 smallint primary key check (id = 1),
  last_reconcile_at  timestamptz not null default now()
);

comment on table public.getnet_callback_heartbeat is
  'Heartbeat do reconcile do getnet-callback (linha única). Só backend (service_role).';

alter table public.getnet_callback_heartbeat enable row level security;
revoke all on public.getnet_callback_heartbeat from anon, authenticated;

drop policy if exists "Deny anon and authenticated on getnet_callback_heartbeat" on public.getnet_callback_heartbeat;
create policy "Deny anon and authenticated on getnet_callback_heartbeat"
  on public.getnet_callback_heartbeat for all
  to anon, authenticated
  using (false)
  with check (false);

