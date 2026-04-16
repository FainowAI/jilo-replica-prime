# Requisitos e regras de negócio — Jilo

## Área do cliente (Sprint 1, Abril 2026)

### Autenticação
- R1. Senha mínima: 6 caracteres
- R2. Login via e-mail + senha (sem magic link por enquanto)
- R3. Sessão persistente com auto-refresh
- R4. Signup cria profile vazio automaticamente via trigger DB

### Perfil
- R5. E-mail não é editável (vive em `auth.users`)
- R6. Todos os campos de perfil são opcionais exceto `id`
- R7. Sem validação de CPF (débito técnico)
- R8. `shopify_customer_id` é preenchido pela Edge Function, nunca pelo usuário

### Endereços
- R9. Um único endereço padrão por usuário (garantido por trigger + índice parcial)
- R10. CEP no formato `^[0-9]{5}-?[0-9]{3}$` (CHECK no DB)
- R11. UF sempre 2 caracteres uppercase (CHECK no DB)
- R12. `profiles.default_shipping_address_id` é cache do endereço com `is_default = true`

### Pedidos
- R13. Pedidos são read-only na área do cliente
- R14. Escrita de pedidos é exclusiva do service_role (webhook Shopify)
- R15. Timeline de status é populada automaticamente via trigger
- R16. Frete é sempre grátis (cortesia Jilo — regra R20 do carrinho)

### Sincronização Shopify (Sprint 2)
- R23. Cada profile no Supabase tem exatamente 1 customer correspondente no Shopify, identificado pelo email
- R24. O campo `shopify_customer_id` só é preenchido pela edge function `shopify-customer-sync` — nunca pelo usuário, nunca pelo frontend direto
- R25. Usuário não autenticado NÃO pode finalizar compra — o botão de checkout em `/carrinho` abre modal de signup se `user === null`
- R26. Falha de sync Shopify NÃO bloqueia a UX — o perfil é salvo normalmente, erro vai só pro console
- R27. Sync é idempotente via argumento `identifier: { emailAddress }` na mutation `customerCreate`

## Carrinho e checkout (já existia)
- R17. Frete sempre grátis
- R18. Checkout redirect para Shopify
- R19. Desconto PIX5 via cupom Shopify ao selecionar PIX no PaymentMethodSelector

## Infraestrutura
- R20. Todas as tabelas com escopo de usuário têm RLS ativo filtrado por `auth.uid()`
- R21. Service role usado apenas server-side (webhooks, Edge Functions)
- R22. Anon key hardcoded em `client.ts` (débito de segurança — migrar para .env)
