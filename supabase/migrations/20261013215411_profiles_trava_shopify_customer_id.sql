-- C1 (13/10): o cliente não pode gravar shopify_customer_id nem inserir profile.
-- O vínculo é gravado só pela edge shopify-customer-sync (service_role, ignora grants);
-- o profile nasce pelo trigger handle_new_user (SECURITY DEFINER).
revoke insert, update on public.profiles from anon, authenticated;
grant update (full_name, phone, cpf, cep, address, address_number, address_complement,
              neighborhood, city, state, default_shipping_address_id, updated_at)
  on public.profiles to authenticated;
