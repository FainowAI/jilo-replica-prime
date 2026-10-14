-- 13/10 (auditoria M1): a edge auth-login-hint virou oráculo de contas Google; o site usa mensagem fixa.
drop function if exists public.auth_email_login_hint(text);
