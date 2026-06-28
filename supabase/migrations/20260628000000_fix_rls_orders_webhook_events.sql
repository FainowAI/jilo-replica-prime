-- ============================================
-- Migration: Corrige vazamento de RLS em orders / webhook_events e endurece profiles
-- Data: 2026-06-28
-- Descrição:
--   As policies "Service role full access on orders" e "Service role only on
--   webhook_events" foram criadas SEM a cláusula `TO`, então recaíram sobre o
--   role PUBLIC com USING(true)/WITH CHECK(true) — expondo TODAS as linhas (e
--   permitindo escrita) a qualquer requisição feita com a anon key.
--   O service_role IGNORA RLS (BYPASSRLS), portanto essas policies nunca foram
--   necessárias para ele; elas apenas abriram as tabelas. Esta migration as
--   remove e restringe o acesso ao dono autenticado, mantendo as escritas via
--   service_role (edge functions) intactas.
-- ============================================

-- 1. orders: remover a policy pública abusiva e restringir leitura ao dono autenticado.
--    Escritas continuam exclusivas das edge functions via service_role (bypass de RLS).
DROP POLICY IF EXISTS "Service role full access on orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;

CREATE POLICY "Users can view own orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. webhook_events: remover a policy pública abusiva. service_role ignora RLS,
--    então nenhuma policy de acesso é necessária; bloqueio explícito para
--    anon/authenticated deixa a intenção clara (mesmo padrão de shopify_admin_tokens).
DROP POLICY IF EXISTS "Service role only on webhook_events" ON public.webhook_events;

CREATE POLICY "Deny anon and authenticated on webhook_events"
  ON public.webhook_events FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 3. profiles: endurecer as policies de PUBLIC -> authenticated (defesa em profundidade).
--    O qual já filtrava pelo dono, mas o role aberto demais permitia avaliar a policy
--    no contexto anon. Restringimos ao role authenticated e adicionamos WITH CHECK no UPDATE.
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
