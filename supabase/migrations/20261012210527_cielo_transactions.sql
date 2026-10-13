-- ============================================
-- Migration: cielo_transactions — cada tentativa de pagamento Alelo via API Cielo E-commerce
-- Data: 2026-10-12
-- Origem: .claude/.work/cielo-vr-bling/plan.md + security.md (H1, H2, M3, M5, B3).
--         Molde: 20260911200746_vr_transactions.sql.
-- Regras:
--   - Tabela SÓ DE BACKEND (service_role ignora RLS). Policy única deny-all com TO explícito.
--   - NUNCA armazena PaymentToken/AccessToken, PAN (nem mascarado), BIN, últimos 4, holder,
--     validade, CVV, CPF, IP, returnMessage ou body de request/response.
--   - A Cielo NÃO deduplica MerchantOrderId: a idempotência é o índice único parcial por
--     cart_id (H1) — inclui void_failed para o cart não ser cobrado de novo com dinheiro preso.
-- ============================================

create table if not exists public.cielo_transactions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users(id) on delete set null,
  cart_id                  text not null,
  merchant_order_id        text not null unique
                             check (char_length(merchant_order_id) <= 50
                                    and merchant_order_id ~ '^[A-Za-z0-9]+$'),
  cielo_env                text not null check (cielo_env in ('mock', 'sandbox', 'prod')),
  cielo_payment_id         text,
  cielo_status             integer,
  cielo_return_code        text,
  cielo_authorization_code text,
  cielo_tid                text,
  cielo_proof_of_sale      text,
  valor_cents              integer not null check (valor_cents > 0),
  status                   text not null default 'authorizing'
                             check (status in (
                               'authorizing', 'declined', 'approved',
                               'voided_auto', 'void_failed', 'voided_manual', 'error'
                             )),
  shopify_draft_order_id   text,
  shopify_order_id         text,
  shopify_order_name       text,
  error                    text,                                -- código interno + status, sem PII
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.cielo_transactions is
  'Tentativas de pagamento Alelo via API Cielo. Só backend (service_role). Nunca armazena token, dado de cartão, CPF ou IP.';
comment on column public.cielo_transactions.error is
  'Código interno (cielo_timeout, cielo_http_502, shopify_draft_failed, void_failed, ...) + status HTTP. Nunca corpo de resposta.';

alter table public.cielo_transactions enable row level security;
revoke all on public.cielo_transactions from anon, authenticated;

drop policy if exists "Deny anon and authenticated on cielo_transactions" on public.cielo_transactions;
create policy "Deny anon and authenticated on cielo_transactions"
  on public.cielo_transactions for all
  to anon, authenticated
  using (false)
  with check (false);

create unique index if not exists cielo_transactions_payment_id_unique
  on public.cielo_transactions (cielo_payment_id)
  where cielo_payment_id is not null;

-- H1: uma transação viva por cart (inclui void_failed: dinheiro possivelmente preso).
create unique index if not exists cielo_transactions_one_live_per_cart
  on public.cielo_transactions (cart_id)
  where status in ('authorizing', 'approved', 'void_failed');

-- M3: rate limit por usuário e breaker por ambiente.
create index if not exists cielo_transactions_user_recent
  on public.cielo_transactions (user_id, created_at desc);
create index if not exists cielo_transactions_env_status_recent
  on public.cielo_transactions (cielo_env, status, created_at desc);

-- H2: varredura do cielo-reconcile.
create index if not exists cielo_transactions_pending_scan
  on public.cielo_transactions (status, created_at)
  where status in ('authorizing', 'void_failed');

drop trigger if exists cielo_transactions_updated_at on public.cielo_transactions;
create trigger cielo_transactions_updated_at
  before update on public.cielo_transactions
  for each row execute function public.update_updated_at_column();
