# Fluxo: Sincronização Shopify (Customer Sync)

## Visão geral
Todo perfil no Supabase tem um customer correspondente no Shopify, identificado pelo email. O sync é disparado automaticamente após o primeiro update de perfil do usuário. A integração usa GraphQL Admin API via edge function Deno.

## Arquivos envolvidos

| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/shopify-customer-sync/index.ts` | Edge function Deno com `verify_jwt: true`. Valida JWT, extrai email do user, chama `customerCreate` GraphQL no Shopify com upsert por email, grava `shopify_customer_id` em `profiles` |
| `src/hooks/useProfile.ts` | `useUpdateProfile` dispara `supabase.functions.invoke("shopify-customer-sync")` quando `shopify_customer_id === null` após update bem-sucedido |

## Env vars necessárias (Supabase Edge Functions Secrets)
| Nome | Exemplo | Obter de |
|------|---------|----------|
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | `shpat_abc123...` | Custom App no Shopify Admin → API credentials (mostrado 1x no install) |
| `SHOPIFY_STORE_DOMAIN` | `jnutg9-u2.myshopify.com` | Domínio fixo da loja (sem protocolo) |
| `SHOPIFY_API_VERSION` | `2025-10` | Versão estável da Admin GraphQL API |

**Escopo da Custom App:** `write_customers` (e `read_customers` opcional).

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

## Gotchas e armadilhas
- Token `shpat_...` só aparece uma vez no install da Custom App — se perder, criar nova app
- A function precisa ter `verify_jwt: true` — caso contrário qualquer um pode chamar
- GraphQL errors e userErrors são diferentes — GraphQL errors (`shopifyData.errors`) indicam problema estrutural; userErrors são validação (email duplicado, phone inválido, etc)
- Email do user vem do JWT, não do payload do cliente — evita spoofing
- Nome é dividido por espaço em firstName/lastName — funciona pra nomes simples, casos complexos ficam com lastName composto (não é problema no Shopify)
- A function usa **dois clients Supabase**: um com JWT do user (só pra `auth.getUser`), outro com service_role (pra ler/escrever `profiles` bypassando RLS)
