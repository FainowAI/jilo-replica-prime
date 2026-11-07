-- ============================================
-- Migration: cielo-reconcile — cron a cada 5 min (pg_cron + pg_net + vault)
-- Data: 2026-11-06
-- Origem: .claude/.work/alelo-teste/cron-cielo-reconcile.sql (preparado em 26/10, promovido a migration em 06/11
--         junto com a correção do fluxo Alelo/Cielo — ver .claude/fluxo-carrinho-checkout.md, seção Alelo).
-- Molde: 20261013200000_getnet_callback_cron.sql (mesmas regras: segredo só pelo NOME no vault, job idempotente).
-- Regras:
--   - O Postgres faz POST em /functions/v1/cielo-reconcile com `Authorization: Bearer <CIELO_RECONCILE_SECRET>`.
--   - NENHUM segredo literal aqui nem em `cron.job.command`: o job lê `vault.decrypted_secrets` (nome
--     `cielo_reconcile_secret`) a cada execução.
--   - O reconcile só age em linhas `authorizing` (> 10 min) e `void_failed` de `cielo_transactions`; sem linhas, não faz nada.
--     Ele NÃO checa ALELO_ENABLED: pendências resolvem mesmo com o kill-switch desligado.
-- Pré-requisitos (dono, FORA de sessão do Claude): gerar o segredo (`openssl rand -base64 48 | tr '+/' '-_' | tr -d '='`)
--   e gravar o MESMO valor (1) no secret `CIELO_RECONCILE_SECRET` da edge e (2) no Vault com o nome `cielo_reconcile_secret`.
--   Sem o segredo no Vault o Authorization vai nulo e a edge responde 401 (o job continua disparando, sem efeito).
-- Aceite: `select status_code, created from net._http_response order by created desc limit 5` com status_code = 200 e o
--   corpo `{"checked":N,"approved":..,"voided":..,"alerted":..}`.
-- ============================================

create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname = 'cielo-reconcile';

select cron.schedule(
  'cielo-reconcile',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://hofohxvizlmawgkinwwz.supabase.co/functions/v1/cielo-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cielo_reconcile_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) as request_id;
  $cron$
);
