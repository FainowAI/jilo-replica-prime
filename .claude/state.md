# Estado do projeto Jilo

## Última atualização
2026-04-16

## O que foi feito na última sessão (Sprint 1 — Área do Cliente)
- Migration aplicada no Supabase com novas tabelas `addresses`, `order_items`, `order_status_history`, extensões em `profiles` e `orders`
- 10 prompts executados implementando:
  - AuthContext + AuthDialog + ProtectedRoute
  - Páginas `/login` e `/cadastro`
  - Layout `/conta/*` com sidebar
  - Perfil editável (`/conta/perfil`)
  - CRUD de endereços (`/conta/enderecos`)
  - Lista e detalhes de pedidos com timeline (`/conta/pedidos`)
  - 4 hooks de dados com TanStack Query
  - 19 arquivos criados, 3 editados
  - 1 migration SQL aplicada (trigger updated_at em profiles)
  - types.ts regenerado manualmente

## Pendências
- Testar fluxo completo de signup → confirmação de email → login → área do cliente
- Validar em mobile (375px)
- Verificar se `line_items` JSONB legado em orders pode ser removido (check se algum código ainda consome)
- Débito técnico: validação de CPF com máscara + checksum
- Débito técnico: integração ViaCEP no AddressFormDialog
- Débito de segurança: migrar anon key do Supabase para `.env`

## Próximo passo planejado (Sprint 2)
Edge Functions para sincronização Shopify ↔ Supabase:
1. `customer-signup-sync` — cria Shopify Customer após signup Supabase
2. `shopify-order-webhook` — processa webhook de pedidos
3. `address-sync` — mantém endereços sincronizados bidirecionalmente

## Notas para a próxima sessão
- A tabela `order_items` só vai ser preenchida quando a Edge Function do Sprint 2 rodar — até lá, pedidos existentes mostram "Nenhum item detalhado disponível"
- O `shopify_customer_id` em profiles também só é preenchido pela Edge Function — inicialmente fica null
- Se for implementar Sprint 2, o fluxo de cadastro/login deve ser testado com pedidos reais do Shopify
