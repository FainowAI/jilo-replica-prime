# Fluxo: Sincronização Shopify (Customer Sync)

## Visão geral
Todo perfil no Supabase tem um customer correspondente no Shopify, identificado pelo email. O sync é disparado automaticamente após o primeiro update de perfil do usuário. A integração usa GraphQL Admin API via edge function Deno.

**Autenticação (Sprint 4.7):** A Sprint 4.7 substituiu o token estático `SHOPIFY_ADMIN_ACCESS_TOKEN` por OAuth 2.0 Client Credentials Grant. Todas as Edge Functions que chamam Admin API agora importam `getShopifyAdminToken()` de `supabase/functions/_shared/shopify-admin-auth.ts`. Os secrets necessários no Supabase são `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET` (não mais `SHOPIFY_ADMIN_ACCESS_TOKEN`). Ver R51 em `requirements.md`.

**Tabela de cache:** `public.shopify_admin_tokens` (1 row sempre), RLS bloqueada, service_role-only. Token expira em 24h, helper faz refresh quando `expires_at - now() < 1h`.

**Edges afetadas:** `update-shipping-variant-price` e `shopify-customer-sync`. A `shopify-webhook-receiver` NÃO foi tocada — ela só valida HMAC com `SHOPIFY_WEBHOOK_SECRET` (que é o client secret usado para signature, separado do access token).

## Arquivos envolvidos

| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/shopify-customer-sync/index.ts` | Edge function Deno com `verify_jwt: true`. Valida JWT, extrai email do user, chama `customerCreate` GraphQL no Shopify com upsert por email, grava `shopify_customer_id` em `profiles` |
| `supabase/functions/shopify-webhook-receiver/index.ts` | Edge function Deno que valida HMAC do Shopify, registra idempotência em `webhook_events` e faz upsert do espelho do pedido em `orders` |
| `src/hooks/useProfile.ts` | `useUpdateProfile` dispara `supabase.functions.invoke("shopify-customer-sync")` quando `shopify_customer_id === null` após update bem-sucedido |

## Env vars necessárias (Supabase Edge Functions Secrets)
| Nome | Exemplo | Obter de |
|------|---------|----------|
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | `shpat_abc123...` | Custom App no Shopify Admin → API credentials (mostrado 1x no install) |
| `SHOPIFY_STORE_DOMAIN` | `jnutg9-u2.myshopify.com` | Domínio fixo da loja (sem protocolo) |
| `SHOPIFY_API_VERSION` | `2025-10` | Versão estável da Admin GraphQL API |
| `SHOPIFY_WEBHOOK_SECRET` | `whsec_...` | Secret configurado nos webhooks Shopify para validar HMAC |
| `SHOPIFY_SHIPPING_VARIANT_ID` | `gid://shopify/ProductVariant/...` | Saída de `npm run setup:shipping` |
| `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`, `UBER_CUSTOMER_ID`, `UBER_API_BASE` | (vide painel Uber Direct) | Edges Uber |
| `JILO_PICKUP_*` | (endereço/lat/lng/telefone) | Edges Uber |

**Escopo da Custom App:** o token em uso (valor literal NÃO documentado aqui — vive apenas em `.env` local e Edge Function Secrets; rotacionar antes do go-live) é um app "full access" com 178 scopes ativos, incluindo `write_customers`, `read_customers`, `write_products`, `read_products`, `write_orders`, `read_orders`. Validado em 2026-04-29 contra `currentAppInstallation.accessScopes`. Se o token for revogado/rotacionado, o substituto precisa manter pelo menos esses scopes.

## Regras de negócio
1. Cada profile no Supabase tem exatamente 1 customer correspondente no Shopify, identificado pelo email
2. O campo `shopify_customer_id` só é preenchido pela edge function — nunca pelo frontend
3. O sync é idempotente: se o profile já tem `shopify_customer_id`, a function retorna `{status: "already_synced"}` sem chamar o Shopify
4. Se o customer já existe no Shopify com aquele email, a mutation faz upsert (argumento `identifier: { emailAddress }`)
5. Falha de sync NÃO bloqueia UX — o perfil é salvo normalmente, erro só vai pro console
6. Customers sincronizados ganham tags `["jilo-customer", "source:supabase"]` no Shopify

## Fluxo
1. Usuário novo faz signup via Supabase Auth
2. Trigger `handle_new_user` cria profile vazio
3. Usuário confirma email e faz primeiro login
4. Acessa `/conta/perfil` e salva alterações (qualquer campo)
5. `useUpdateProfile` chama `supabase.functions.invoke("shopify-customer-sync")`
6. Edge function:
   - Valida JWT
   - Busca profile via service_role
   - Se `shopify_customer_id` existe → retorna early (idempotência)
   - Monta input para `customerCreate` (email, firstName, lastName split, phone, tags)
   - Chama GraphQL Admin API com upsert por email
   - Se sucesso, atualiza `profiles.shopify_customer_id` com o GID retornado
7. Frontend re-invalida a query de profile e mostra o campo populado

## Respostas da edge function
- **200** `{"status":"synced", "shopify_customer_id":"gid://shopify/Customer/123"}` — sucesso
- **200** `{"status":"already_synced", "shopify_customer_id":"..."}` — idempotente
- **401** JWT inválido/expirado
- **400** userErrors de validação Shopify
- **502** Erro de rede ou GraphQL error

## Webhook de pedidos e entrega
1. `shopify-webhook-receiver` recebe tópicos como `orders/create`, `orders/paid` e `orders/fulfilled`
2. Antes de processar, registra o evento em `webhook_events` usando `(source, event_type, external_id)` para idempotência
3. Em `orders/create`, faz upsert do espelho em `public.orders` com totais, cliente, endereço e `shopify_checkout_token`
4. A migration `20260429000000_orders_uber_delivery_fields.sql` adiciona ao espelho do pedido os campos de entrega `delivery_method`, `uber_quote_id`, `uber_delivery_id`, `uber_tracking_url`, `shipping_fee_cents` e `delivery_status`
5. Pedidos antigos continuam válidos com `delivery_method = NULL`, `shipping_fee_cents = 0` e `delivery_status = 'pending_dispatch'`
6. `idx_orders_uber_delivery_id` acelera consultas de webhooks/status Uber quando `uber_delivery_id` já foi preenchido
7. **Sprint 4.1 (frete Uber Direct):** O handler de `orders/paid` foi estendido para popular `delivery_method`, `uber_quote_id`, `shipping_fee_cents` e `delivery_status`. Lê `note_attributes` do payload Shopify (gravados pelo frontend via `cartAttributesUpdate` antes do redirect). Se `delivery_method='uber_direct'` e tem quote, dispara fire-and-forget para edge `uber-create-delivery` que efetivamente cria a delivery na Uber. Vide `.claude/fluxo-uber-direct.md`.

## Gotchas e armadilhas
- Token `shpat_...` só aparece uma vez no install da Custom App — se perder, criar nova app
- A function precisa ter `verify_jwt: true` — caso contrário qualquer um pode chamar
- GraphQL errors e userErrors são diferentes — GraphQL errors (`shopifyData.errors`) indicam problema estrutural; userErrors são validação (email duplicado, phone inválido, etc)
- Email do user vem do JWT, não do payload do cliente — evita spoofing
- Nome é dividido por espaço em firstName/lastName — funciona pra nomes simples, casos complexos ficam com lastName composto (não é problema no Shopify)
- A function usa **dois clients Supabase**: um com JWT do user (só pra `auth.getUser`), outro com service_role (pra ler/escrever `profiles` bypassando RLS)
- **O mesmo token de Admin Shopify vive em dois nomes de variável diferentes:** `SHOPIFY_ADMIN_TOKEN` no `.env` local (lido pelos scripts Node — `seed-products.ts`, `setup-shipping-variant.ts`, `generate-seo-files.ts`) e `SHOPIFY_ADMIN_ACCESS_TOKEN` nos Edge Function Secrets (lido pelas edges Deno — `shopify-customer-sync`, `update-shipping-variant-price`). NÃO unificar — renomear quebra integrações em produção.
- **`SHOPIFY_STORE_DOMAIN`** funciona com o domínio técnico (`jnutg9-u2.myshopify.com`) ou com o alias amigável (`jilo-marmitas.myshopify.com`). Manter `jnutg9-u2.myshopify.com` nas Edge Functions por consistência (esse não muda mesmo se a loja trocar de slug).
