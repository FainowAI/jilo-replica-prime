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
| `src/hooks/useOrders.ts` | `useOrders()` — invoca a edge function `customer-orders` (pedidos direto da Shopify). Exporta as interfaces `CustomerOrder`, `CustomerOrderItem`, `CustomerOrderHistoryEntry`, `CustomerOrderShippingAddress` |
| `src/hooks/useOrderDetails.ts` | `useOrderDetails(id)` — deriva do cache de `useOrders()` (sem chamada de rede extra), acha o pedido por id |

### Edge function (fonte dos pedidos)
| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/customer-orders/index.ts` | Busca os pedidos do cliente logado na **Shopify Admin API** (`orders(query:"customer_id:...")`). Identidade vem do JWT (`getUser`), nunca do body (anti-IDOR). Reusa `_shared/shopify-admin-auth.ts`. `verify_jwt=true`. Mapeia o pedido Shopify → o shape que a UI já consome (order + items + history derivado). |

## Tabelas do banco (ver `fluxo-infraestrutura.md` para schema completo)
- `profiles` — dados pessoais + `shopify_customer_id` + `default_shipping_address_id`
- `addresses` — múltiplos endereços por usuário com `is_default`
- `orders` / `order_items` / `order_status_history` — **NÃO são mais lidas pela área do cliente**. Os pedidos exibidos ao usuário vêm ao vivo da Shopify Admin API (edge function `customer-orders`). Essas tabelas continuam populadas pelo webhook e servem backend/admin/Bling/Uber, mas: (a) o webhook nunca preenche `orders.user_id` (por isso a página ficava vazia), e (b) a captura estava incompleta. A fonte de verdade dos pedidos é a Shopify.

## Regras de negócio

1. **Login obrigatório em `/conta/*`** — `ProtectedRoute` redireciona pra `/login?redirect=<path>`
2. **Signup cria profile vazio** — trigger `handle_new_user` no DB faz isso automaticamente
3. **E-mail não editável** — vive em `auth.users`, profile só exibe
4. **Endereço default único** — trigger `ensure_single_default_address` desmarca os outros
5. **`profiles.default_shipping_address_id` é cache** — sync automático via trigger `sync_profile_default_address`
6. **Pedidos são read-only e vêm da Shopify** — a área do cliente busca ao vivo via edge function `customer-orders` (Admin API), filtrando por `customer_id` do cliente logado (do JWT). Usuário só visualiza.
7. **Status derivado da Shopify** — a Shopify só expõe status financeiro + de fulfillment; a function deriva o badge PT-BR (cancelled > refunded > dispatched(fulfilled) > paid > pending). A timeline é derivada dos dados Shopify (recebido → pago → enviado/rastreio), não da tabela `order_status_history`.
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
1. Acessa `/conta/pedidos` → `useOrders()` invoca a edge function `customer-orders`, que busca os pedidos do cliente logado na Shopify Admin API (por `customer_id`)
2. Clica em um pedido → navega para `/conta/pedidos/:id` (o `:id` é o id numérico do pedido Shopify)
3. `useOrderDetails(id)` deriva do cache de `useOrders()` (sem rede extra) e acha o pedido por id
4. Renderiza: itens, timeline derivada, resumo de valores, endereço de entrega, link de rastreio (se houver)
5. Sem ações de edição — tudo read-only

## Integrações
| Integração | Tipo | Descrição |
|-----------|------|-----------|
| Shopify Admin API | edge function `customer-orders` | Fonte dos pedidos exibidos ao cliente — `orders(query:"customer_id:...")` com token admin OAuth cacheado |
| Supabase Auth | auth.users | Signup, login, sessão persistente em localStorage |
| Supabase DB | 5 tabelas | Profile, addresses, orders, order_items, order_status_history |
| RLS | Todas as tabelas | `auth.uid() = user_id` em queries — isolamento automático |
| TanStack Query | Cache | Todas as queries cachadas por `queryKey` + invalidação em mutations |

## Gotchas e armadilhas
- `AuthProvider` DEVE estar dentro do `BrowserRouter` (ProtectedRoute usa `useLocation`)
- **Pedidos vêm da Shopify, não do Supabase** — mudança de fonte feita em Jul/2026. A tabela `orders` do Supabase (via webhook) tinha `user_id` sempre NULL e captura incompleta, então a página ficava vazia. Agora a edge function `customer-orders` busca ao vivo por `customer_id`.
- `shopify_customer_id` **É preenchido** pela edge function `shopify-customer-sync` no login (SIGNED_IN) — a `customer-orders` depende dele (fallback por e-mail se ausente). O gotcha antigo "não é preenchido, Sprint 2" está OBSOLETO.
- **Limitação Shopify `read_orders` (~60 dias):** sem o scope `read_all_orders` (requer aprovação Shopify), pedidos com mais de ~60 dias podem sumir da lista. Aceito por ora; se necessário, solicitar `read_all_orders`.
- `useOrderDetails` NÃO faz rede — deriva do cache de `useOrders()`. Se o pedido não estiver na lista (ex.: link direto e lista ainda não carregou), a query de `useOrders` roda mesmo assim (é barata).
- Endereço de entrega da Shopify não separa número/bairro — `number` e `neighborhood` vêm `null` no shape mapeado.
- Escopo de acesso depende de **confirmação de e-mail obrigatória** (hoje login é OAuth Google, e-mail já verificado). Se habilitarem signup e-mail/senha sem confirmação, revisar (spoofing de e-mail).
- Validação de CPF não é implementada (campo TEXT livre) — débito técnico
- A anon key do Supabase continua hardcoded em `client.ts` — débito de segurança
- Sem integração ViaCEP no formulário de endereço — usuário digita tudo manualmente
