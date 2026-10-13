-- Dica de login para contas Google (sem senha). Só service_role (edge `auth-login-hint`):
-- exposta a anon/authenticated seria enumeração de e-mails.
create or replace function public.auth_email_login_hint(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'google'::text
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
    and u.raw_app_meta_data->'providers' ? 'google'
  limit 1;
$$;

revoke all on function public.auth_email_login_hint(text) from public, anon, authenticated;
grant execute on function public.auth_email_login_hint(text) to service_role;
