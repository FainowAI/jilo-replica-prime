-- ============================================
-- Migration: vr_transactions — registro de cada tentativa de pagamento com VR (Vale Refeição)
-- Data: 2026-09-11
-- Origem: .claude/docs/eap_pagamento_vr.md §5.3 (blueprint) + auditoria de segurança
--         (.claude/.work/pagamento-vr/security.md): C1 idempotência no banco, M1 user_id
--         nullable, M2 tabela só de backend, A4 índice para rate limit.
-- Regras:
--   - Tabela SÓ DE BACKEND: nenhuma tela lê; escrita e leitura só pelo service_role
--     (que ignora RLS). Policy única deny-all para anon/authenticated (padrão
--     webhook_events / shopify_admin_tokens), sempre com TO explícito.
--   - NUNCA armazena dado de cartão: número, últimos 4, BIN, nome impresso, validade,
--     CVV, blob criptografado, CPF/documento do titular ou IP. `error` recebe só um
--     código interno + status HTTP, nunca corpo de resposta.
--   - Um cart Shopify só pode ter UMA transação viva (authorizing/approved): é o índice
--     único parcial que fecha o duplo clique / duas abas — o vr-checkout faz INSERT
--     antes de qualquer chamada externa e trata 23505.
-- ============================================

create table if not exists public.vr_transactions (
  id                     uuid primary key default gen_random_uuid(),
  -- nullable + set null: exclusão da conta (LGPD) anonimiza o registro financeiro
  user_id                uuid references auth.users(id) on delete set null,
  cart_id                text not null,                       -- gid do Shopify Cart
  id_transacao_van       text not null unique
                           check (char_length(id_transacao_van) <= 15), -- limite da API VR
  vr_id_transacao        text,                                -- id devolvido pela VR
  vr_codigo_retorno      text,                                -- '00' aprovado, etc.
  vr_codigo_autorizacao  text,
  valor_cents            integer not null check (valor_cents > 0),
  status                 text not null default 'authorizing'
                           check (status in (
                             'authorizing', 'declined', 'approved',
                             'refunded_auto', 'refund_failed', 'refunded_manual', 'error'
                           )),
  shopify_draft_order_id text,
  shopify_order_id       text,
  shopify_order_name     text,
  error                  text,                                -- código interno + status, sem PII
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.vr_transactions is
  'Tentativas de pagamento com VR (API Captura). Só backend (service_role). Nunca armazena dado de cartão, CPF ou IP.';
comment on column public.vr_transactions.error is
  'Código interno (vr_timeout, vr_http_500, shopify_draft_failed, ...) + status HTTP. Nunca corpo de resposta.';

-- RLS: deny-all para cliente. service_role ignora RLS (BYPASSRLS) — não precisa de policy.
alter table public.vr_transactions enable row level security;

drop policy if exists "Deny anon and authenticated on vr_transactions" on public.vr_transactions;
create policy "Deny anon and authenticated on vr_transactions"
  on public.vr_transactions for all
  to anon, authenticated
  using (false)
  with check (false);

-- Idempotência no banco (auditoria C1): uma transação viva por cart.
create unique index if not exists vr_transactions_one_live_per_cart
  on public.vr_transactions (cart_id)
  where status in ('authorizing', 'approved');

-- Rate limit / breaker (auditoria A4): recusas recentes por usuário e globais.
create index if not exists vr_transactions_user_recent
  on public.vr_transactions (user_id, created_at desc);
create index if not exists vr_transactions_status_recent
  on public.vr_transactions (status, created_at desc);

-- updated_at automático (reusa a função já existente no schema, como profiles/addresses).
drop trigger if exists vr_transactions_updated_at on public.vr_transactions;
create trigger vr_transactions_updated_at
  before update on public.vr_transactions
  for each row execute function public.update_updated_at_column();
