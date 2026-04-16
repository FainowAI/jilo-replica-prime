# Estado do projeto Jilo

## Última atualização
2026-04-16

## O que foi feito na última sessão (Sprint 2 — Shopify Sync + Checkout Gating)
- Edge function `shopify-customer-sync` criada e deployada (Deno, GraphQL Admin API)
- `useUpdateProfile` agora dispara sync automaticamente quando `shopify_customer_id === null`
- `/carrinho` valida autenticação antes do checkout — abre modal de signup se usuário está deslogado
- Novo doc `.claude/fluxo-shopify-sync.md` criado
- 5 requirements adicionados (R23-R27)
- 3 novas env vars configuradas no Supabase: `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_API_VERSION`

## Histórico de sprints
- **Sprint 1 (2026-04-16)** — Área do cliente completa (auth, perfil, pedidos, endereços, timeline)
- **Sprint 2 (2026-04-16)** — Shopify customer sync + checkout gating

## Pendências
- Testar o fluxo end-to-end: signup → confirmar email → login → atualizar perfil → verificar customer criado no Shopify Admin
- Testar gating de checkout: usuário deslogado clica "Entrar para finalizar" → signup no modal → checkout abre automaticamente
- Validar escopo `write_customers` do Admin API access token
- Débito técnico carryover: validação de CPF com máscara + checksum
- Débito técnico carryover: integração ViaCEP no AddressFormDialog
- Débito de segurança carryover: migrar anon key do Supabase para `.env`

## Próximos passos planejados
Sprint 3 — backend de pedidos ligado ao checkout:
1. Extender `shopify-webhook-receiver` para popular `order_items` (tabela normalizada, hoje vazia)
2. Garantir que `orders.user_id` seja preenchido via lookup por email quando webhook chegar
3. Webhook `customers/update` para refletir mudanças do Shopify no Supabase (bidirecional)
4. Integração Bling ERP (skill `bling-erp` pendente)

## Notas para a próxima sessão
- O sync Shopify roda no primeiro update de perfil — se o usuário nunca editar o perfil, nunca sincroniza. Considerar: fazer sync também no primeiro login (trigger via AuthContext?) se isso for problema.
- O gating de checkout é no `/carrinho` — CartDrawer não precisa porque só navega pra `/carrinho` sem fazer checkout direto.
- `handleBuyNow` existe em Product.tsx mas não é chamado — se for reativado no futuro, vai precisar do mesmo gating.
