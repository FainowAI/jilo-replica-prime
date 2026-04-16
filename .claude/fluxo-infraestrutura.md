# Fluxo: Infraestrutura

## Stack completa
| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | React | 18.3.1 |
| Linguagem | TypeScript | 5.8.3 strict |
| Bundler | Vite | 5.4.19 (plugin SWC) |
| CSS | Tailwind CSS | 3.4.17 + tailwindcss-animate |
| UI Library | shadcn/ui (Radix) | Diversos componentes |
| State (local) | Zustand | 5.0.11 (persist middleware) |
| State (server) | TanStack Query | 5.83.0 |
| Forms | React Hook Form + Zod | 7.61.1 + 3.25.76 |
| Routing | React Router DOM | 6.30.1 |
| Animações | Framer Motion | 12.35.0 |
| Notificações | Sonner | 1.7.4 |
| Ícones | Lucide React | 0.462.0 |
| Auth + DB | Supabase JS | 2.98.0 |
| E-commerce | Shopify Storefront API | 2025-07 |
| Testes | Vitest + Testing Library | 3.2.4 |

## Padrões do projeto
| Padrão | Implementação |
|--------|--------------|
| Routing | Centralizado em `src/App.tsx` com `<BrowserRouter>` + `<Routes>`. Sem lazy loading. |
| State management | Zustand para carrinho (persist localStorage key `shopify-cart`), TanStack Query para dados Shopify |
| UI library | shadcn/ui (Radix) — componentes em `src/components/ui/` |
| Data fetching | `storefrontApiRequest()` em `src/lib/shopify.ts` → GraphQL direto. TanStack Query no Product page. |
| Componentização | Páginas em `src/pages/`, seções em `src/components/sections/`, UI em `src/components/ui/` |
| Tipagem | TypeScript strict, tipos Supabase gerados em `src/integrations/supabase/types.ts` |
| Notificações | Sonner (toast) + shadcn Toaster |
| Fontes | DM Sans (corpo) + DM Serif Display (títulos) — carregadas via Google Fonts no `index.html` |
| Cores principais | Verde escuro #1E3A1E, off-white #FAF7F2, bege #f0efeb, dourado #d4a017, cinza texto #6b6b6b/#9b9b9b |

## Dados institucionais da marca
| Campo | Valor |
|-------|-------|
| Razão social | DaJu Alimentação |
| CNPJ | 39.659.013/0001-02 |
| WhatsApp oficial | +55 12 98895-0426 (link: https://wa.me/5512988950426) |
| Ano de copyright corrente | 2026 |

Esses dados aparecem em `src/components/sections/Footer.tsx` (rodapé + links de atendimento) e `src/components/sections/FAQ.tsx` (botão "Falar no WhatsApp"). Qualquer alteração deve ser replicada em ambos.

## Banco de dados (Supabase)

### Tabelas
| Tabela | Descrição | Colunas principais | RLS |
|--------|-----------|-------------------|-----|
| `profiles` | Perfil do usuário (endereço para entrega) | id (UUID, FK auth.users), full_name, phone, cpf, cep, address, address_number, address_complement, neighborhood, city, state, created_at, updated_at | Sim — SELECT/UPDATE/INSERT own |

### Foreign Keys
| Origem | Destino | Tipo |
|--------|---------|------|
| profiles.id | auth.users.id | CASCADE on DELETE |

### RLS Policies
| Tabela | Policy | Ação | Condição |
|--------|--------|------|----------|
| profiles | Users can view own profile | SELECT | auth.uid() = id |
| profiles | Users can update own profile | UPDATE | auth.uid() = id |
| profiles | Users can insert own profile | INSERT | auth.uid() = id |

### Functions e Triggers
| Função | Trigger | Descrição |
|--------|---------|-----------|
| handle_new_user() | on_auth_user_created (AFTER INSERT on auth.users) | Cria automaticamente um registro em profiles quando um novo usuário se registra |

### Observações do banco
- Apenas 1 tabela no schema public (`profiles`) — o banco é enxuto porque produtos, pedidos e checkout são gerenciados pelo Shopify.
- Nenhum dado de produto/pedido está no Supabase.
- Todos os campos de endereço são nullable — o perfil é criado vazio e preenchido depois.
- `updated_at` NÃO atualiza automaticamente no UPDATE — precisa de trigger ou update manual.

## Integrações externas

### Shopify Storefront API
| Item | Valor |
|------|-------|
| Store | jnutg9-u2.myshopify.com |
| API Version | 2025-07 |
| Endpoint | https://jnutg9-u2.myshopify.com/api/2025-07/graphql.json |
| Auth | X-Shopify-Storefront-Access-Token (público, hardcoded) |
| Arquivo | `src/lib/shopify.ts` |

**Queries usadas:**
- `PRODUCTS_QUERY` — lista produtos com filtro por query (first, query)
- `PRODUCT_BY_HANDLE_QUERY` — busca produto individual por handle
- `CART_CREATE_MUTATION` — cria carrinho
- `CART_LINES_ADD_MUTATION` — adiciona item ao carrinho
- `CART_LINES_UPDATE_MUTATION` — atualiza quantidade
- `CART_LINES_REMOVE_MUTATION` — remove item
- `CART_QUERY` — consulta status do carrinho (id, totalQuantity)

### Supabase Auth
- Client configurado em `src/integrations/supabase/client.ts`
- Usa localStorage para persistência de sessão
- Auto-refresh de token habilitado
- Tipos gerados em `src/integrations/supabase/types.ts`

## Scripts
| Script | Arquivo | Descrição |
|--------|---------|-----------|
| seed | `scripts/seed-products.ts` | Cria produtos no Shopify Admin API. Requer env var `SHOPIFY_ADMIN_TOKEN`. Delay de 500ms entre requests. |
| seed:collections | `scripts/create-collections.ts` | Cria collections (categorias) no Shopify Admin API. |

**Preços por grupo (seed):**
- Aves e Suinos: R$18,94
- Peixes e Massas: R$20,30
- Bovinos: R$25,70
- Veganos: R$25,70

## Gotchas e armadilhas
- O Storefront Access Token está hardcoded em `shopify.ts` — é token público mas deveria estar em .env
- Se a store Shopify não tiver plano ativo, a API retorna 402 — há handler com toast de erro
- O `cartStore` usa `persist` do Zustand com localStorage — key `shopify-cart`. Se mudar a interface do store, carts antigos podem quebrar.
- A função `formatCheckoutUrl` adiciona `?channel=online_store` ao checkout URL
- O `useCartSync` hook roda no mount do App (dentro de `AppContent`) para verificar se o cart ainda existe no Shopify
- A anon key do Supabase está hardcoded no client.ts — padrão Lovable, deveria estar em .env
- Não há tratamento de loading global (skeleton isolado por componente)
- O projeto usa `lovable-tagger` como devDependency — plugin de tag do Lovable
