-- ============================================
-- Migration: getnet-callback — cron do reconcile (pg_cron + pg_net + vault)
-- Data: 2026-10-13
-- Origem: .claude/.work/getnet-callback/tickets/02-reprocessamento.md + security.md (S-04.2, S-09, S-10).
-- Regras:
--   - A cada 5 min o Postgres faz POST em /functions/v1/getnet-callback/reconcile com
--     `Authorization: Bearer <GETNET_RECONCILE_SECRET>` (segredo DISTINTO do segredo do path da Getnet).
--   - NENHUM segredo literal aqui nem em `cron.job.command`: o job lê só o NOME do segredo no vault
--     (`vault.decrypted_secrets`, nome `getnet_reconcile_secret`) a cada execução.
--   - Sem RPC/função nova em public (S-09): o claim por lease é UPDATE condicional feito pela edge.
--   - Idempotente: desagenda o job de mesmo nome antes de agendar de novo.
-- Pré-requisitos (dono, FORA de sessão do Claude): gerar o segredo (ex.: `openssl rand -base64 48 | tr '+/' '-_' | tr -d '='`),
--   gravar o MESMO valor (1) no secret `GETNET_RECONCILE_SECRET` da edge e (2) no Vault (dashboard > Vault) com o nome
--   `getnet_reconcile_secret`. Sem o segredo no Vault o Authorization vai nulo: a edge responde 404 (ou o job falha).
-- Aceite (S-10): `cron.job_run_details.status = 'succeeded'` só prova que o POST foi enfileirado. O aceite real é
--   `select status_code, created from net._http_response order by created desc limit 5` com status_code = 200 e a linha
--   de `getnet_callback_heartbeat` (id = 1) avançando a cada 5 min. Alerta se `last_reconcile_at` ficar > 15 min parado.
--   O corpo da resposta fica em `net._http_response` por horas: o reconcile devolve só contadores.
-- Kill-switch: com `GETNET_CALLBACK_ENABLED` != true o reconcile responde 404 (o job continua disparando, sem efeito).
-- ============================================

-- pg_cron não é relocável (pg_available_extension_versions.schema = null no projeto); a doc do Supabase instala em
-- pg_catalog. As funções do agendador ficam em `cron.*` de qualquer forma.
create extension if not exists pg_cron with schema pg_catalog;

-- Idempotência: sem erro quando o job ainda não existe.
select cron.unschedule(jobid) from cron.job where jobname = 'getnet-callback-reconcile';

select cron.schedule(
  'getnet-callback-reconcile',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://hofohxvizlmawgkinwwz.supabase.co/functions/v1/getnet-callback/reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'getnet_reconcile_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) as request_id;
  $cron$
);

