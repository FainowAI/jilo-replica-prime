# Fluxo: Perfil de Usuário e Área do Cliente

## Visão geral
A área do cliente Jilo é um sistema completo de gestão pessoal, acessível via `/conta/*` com autenticação obrigatória. Cobre: perfil editável, endereços múltiplos, lista de pedidos, detalhes de pedido com timeline de status. Implementada no Sprint 1 (Abril 2026).

## Arquivos envolvidos

### Autenticação
| Arquivo | Descrição |
|---------|-----------|
| `src/contexts/AuthContext.tsx` | Context provider global — expõe `user`, `session`, `signIn`, `signUp`, `signOut`. Escuta `onAuthStateChange` |
| `src/components/AuthDialog.tsx` | Modal reutilizável de login/cadastro (alterna entre modos) |
| `src/components/ProtectedRoute.tsx` | Guarda rotas — redireciona para `/login?redirect=X` se não autenticado |
| `src/pages/Login.tsx` | Página dedicada de login |
| `src/pages/Cadastro.tsx` | Página dedicada de cadastro |

### Layout da área do cliente
| Arquivo | Rota | Descrição |
|---------|------|-----------|
| `src/pages/Conta.tsx` | `/conta` | Layout com sidebar + `<Outlet />` |
| `src/components/conta/ContaSidebar.tsx` | — | Sidebar navegável (Perfil, Pedidos, Endereços, Sair) |

### Páginas aninhadas
| Arquivo | Rota | Descrição |
|---------|------|-----------|
| `src/pages/conta/Perfil.tsx` | `/conta/perfil` (+ index) | Editar nome, telefone, CPF |
| `src/pages/conta/Enderecos.tsx` | `/conta/enderecos` | Lista de endereços + CRUD |
| `src/pages/conta/Pedidos.tsx` | `/conta/pedidos` | Lista de pedidos do usuário |
| `src/pages/conta/PedidoDetalhe.tsx` | `/conta/pedidos/:id` | Detalhes com itens, timeline e endereço |

### Componentes da área do cliente
| Arquivo | Descrição |
|---------|-----------|
| `src/components/conta/AddressCard.tsx` | Card visual de endereço com ações |
| `src/components/conta/AddressFormDialog.tsx` | Dialog de criação/edição |
| `src/components/conta/OrderStatusBadge.tsx` | Badge colorido de status do pedido |
| `src/components/conta/OrderStatusTimeline.tsx` | Timeline vertical do histórico |

### Hooks de dados
| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/useProfile.ts` | `useProfile()`, `useUpdateProfile()` |
| `src/hooks/useAddresses.ts` | `useAddresses()`, `useCreateAddress()`, `useUpdateAddress()`, `useDeleteAddress()` |
| `src/hooks/useOrders.ts` | `useOrders()` — lista ordenada por `placed_at desc` |
| `src/hooks/useOrderDetails.ts` | `useOrderDetails(id)` — fetch paralelo de order + items + history |

## Tabelas do banco (ver `fluxo-infraestrutura.md` para schema completo)
- `profiles` — dados pessoais + `shopify_customer_id` + `default_shipping_address_id`
- `addresses` — múltiplos endereços por usuário com `is_default`
- `orders` — pedidos (populados via webhook Shopify)
- `order_items` — itens normalizados de cada pedido
- `order_status_history` — timeline automática via trigger

## Regras de negócio

1. **Login obrigatório em `/conta/*`** — `ProtectedRoute` redireciona pra `/login?redirect=<path>`
2. **Signup cria profile vazio** — trigger `handle_new_user` no DB faz isso automaticamente
3. **E-mail não editável** — vive em `auth.users`, profile só exibe
4. **Endereço default único** — trigger `ensure_single_default_address` desmarca os outros
5. **`profiles.default_shipping_address_id` é cache** — sync automático via trigger `sync_profile_default_address`
6. **Pedidos são read-only** — usuário só visualiza; escrita é exclusiva do service_role (webhook Shopify)
7. **Timeline automática** — trigger `log_order_status_change` insere em `order_status_history` a cada mudança de status
8. **Validação CEP no frontend** — regex `^[0-9]{5}-?[0-9]{3}$` espelha o CHECK do DB
9. **UF uppercase e 2 chars** — input auto-uppercase espelha CHECK do DB

## Fluxo do usuário

### Signup + primeiro login
1. Usuário clica em ícone User no Header → abre `AuthDialog` em modo signup
2. Preenche nome, e-mail, senha (min 6 chars)
3. Supabase envia e-mail de confirmação
4. Trigger `handle_new_user` cria profile vazio automaticamente
5. Após confirmação, usuário volta ao site e faz login
6. Redirecionado para `/conta/perfil` (ou `?redirect` se veio de rota protegida)

### Gestão de endereços
1. Acessa `/conta/enderecos`
2. Clica "Novo endereço" → abre `AddressFormDialog`
3. Preenche campos obrigatórios + marca "padrão" se quiser
4. `useCreateAddress` insere via Supabase com `user_id` automático
5. Trigger do DB garante unicidade de default
6. Lista recarrega via `queryClient.invalidateQueries`
7. **Cadastro inline no carrinho**: O `<AddressFormDialog />` também é usado pelo `<DeliveryAddressSelector />` no `/carrinho` — usuário sem endereço pode cadastrar sem sair da página de checkout. O modal funciona igual em ambos os contextos. Vide `.claude/fluxo-carrinho-checkout.md`.

### Visualização de pedidos
1. Acessa `/conta/pedidos` → lista via `useOrders()` filtrada por `user_id`
2. Clica em um pedido → navega para `/conta/pedidos/:id`
3. `useOrderDetails` faz 3 queries paralelas (order + items + history)
4. Renderiza: itens, timeline vertical, resumo de valores, endereço de entrega
5. Sem ações de edição — tudo read-only

## Integrações
| Integração | Tipo | Descrição |
|-----------|------|-----------|
| Supabase Auth | auth.users | Signup, login, sessão persistente em localStorage |
| Supabase DB | 5 tabelas | Profile, addresses, orders, order_items, order_status_history |
| RLS | Todas as tabelas | `auth.uid() = user_id` em queries — isolamento automático |
| TanStack Query | Cache | Todas as queries cachadas por `queryKey` + invalidação em mutations |

## Gotchas e armadilhas
- `AuthProvider` DEVE estar dentro do `BrowserRouter` (ProtectedRoute usa `useLocation`)
- `useOrderDetails` faz 3 queries paralelas com `Promise.all` — se uma falhar, a query falha toda
- `shipping_address` em `orders` é JSONB — frontend faz cast para interface `ShippingAddress`
- Pedidos antigos sem `order_items` ainda aparecem — só a seção de itens mostra "Nenhum item detalhado disponível"
- `line_items` JSONB em `orders` é **legado** — não consumimos no frontend, usamos `order_items` normalizada
- `shopify_customer_id` NÃO é preenchido pelo frontend — vai ser populado pela Edge Function do Sprint 2
- Validação de CPF não é implementada (campo TEXT livre) — débito técnico
- A anon key do Supabase continua hardcoded em `client.ts` — débito de segurança
- Sem integração ViaCEP no formulário de endereço — usuário digita tudo manualmente
