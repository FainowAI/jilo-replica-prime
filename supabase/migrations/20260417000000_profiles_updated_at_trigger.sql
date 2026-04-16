-- Adiciona trigger de updated_at automatico em profiles
-- Reusa a funcao update_updated_at_column que ja existe no schema

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();
