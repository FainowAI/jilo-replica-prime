# Fluxo: Catálogo de Produtos

## Visão geral
O catálogo da Jilo exibe marmitas artesanais organizadas em 4 categorias: Aves e Suinos, Bovinos, Peixes e Massas, Veganos. Todos os dados vêm da Shopify Storefront API via GraphQL — NÃO há tabela de produtos no Supabase.

## Arquivos envolvidos

### Páginas
| Arquivo | Rota | Descrição |
|---------|------|-----------|
| `src/pages/Index.tsx` | `/` | Homepage — monta as seções incluindo Favorites, AllDishes, QuickCategories |
| `src/pages/Cardapio.tsx` | `/cardapio` | Página de cardápio completo — wrapper para FullMenu |
| `src/pages/Product.tsx` | `/produto/:handle` | Página de detalhe do produto com TanStack Query |
| `src/pages/Collection.tsx` | `/colecao/:categoria` | Lista filtrada por collection/categoria |

### Componentes-chave
| Arquivo | Descrição |
|---------|-----------|
| `src/components/sections/FullMenu.tsx` | Componente principal do catálogo — grid de produtos com filtro por categoria (URL params), busca com debounce (400ms), ordenação (relevância, alfabética, menor/maior preço, maior desconto). Carrega até 50 produtos. |
| `src/components/sections/Favorites.tsx` | Seção "Os favoritos da galera" na homepage — puxa os mais pedidos |
| `src/components/sections/AllDishes.tsx` | Seção "Monte o Kit da sua Semana" na homepage — grid completo com filtro por categoria |
| `src/components/sections/QuickCategories.tsx` | Botões de categoria rápida na homepage |
| `src/components/sections/Hero.tsx` | Banner principal com CTAs |
| `src/components/sections/ProductComposition.tsx` | Composição visual do prato na página de detalhe |
| `src/components/sections/ProductDetails.tsx` | Detalhes expandidos do produto |
| `src/components/sections/ProductReviews.tsx` | Avaliações do produto (UI estática — sem backend) |
| `src/components/sections/RelatedProducts.tsx` | Produtos relacionados por productType |

### Lib
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/shopify.ts` | Client Shopify — storefrontApiRequest(), queries GraphQL, mutations de cart, tipos ShopifyProduct |

## Tabelas do banco
Nenhuma. Produtos são gerenciados 100% pelo Shopify.

## Regras de negócio

1. **Categorias fixas em ordem**: `CATEGORY_ORDER` no FullMenu define: `["Aves e Suinos", "Bovinos", "Peixes e Massas", "Veganos"]`. Categorias fora dessa lista aparecem no final.

2. **Busca com debounce**: O FullMenu tem busca com debounce de 400ms — `searchInput` é separado do `searchQuery`. A busca filtra por título do produto E por nome da categoria. A filtragem é no frontend APÓS carregar todos os produtos.

3. **Ordenação**: 5 opções — Relevância (padrão), Ordem alfabética, Mais vendidos (mesmo que relevância), Menor preço, Maior preço. "Maior desconto" compara `compareAtPrice` com `price`.

4. **Filtro por categoria**: Via search params na URL (`?category=Bovinos`). "Todos" remove o param. Header search redireciona para `/cardapio?search=query`.

5. **Tags como badges**: Sistema de badges usa tags do Shopify — `mais-pedido` → "⭐ Mais pedido" (amarelo), `vegano` → "🌱 Vegano" (verde), `low-carb` → "Low Carb", `novo` → "Novo". Prioridade é a primeira match.

6. **Preço no Pix**: Na página de produto, o preço com Pix = `price * 0.95` (5% off). Puramente frontend — sem desconto real no Shopify.

7. **Produtos carregados em batch**: FullMenu carrega até 50 produtos (`first: 50`). Se o catálogo crescer, precisa de paginação cursor-based.

8. **Categorias por productType**: Produtos agrupados pelo campo `productType` do Shopify, NÃO por collections.

9. **Emojis por categoria**: Mapeamento fixo — "Aves e Suinos" → 🍗, "Bovinos" → 🥩, "Peixes e Massas" → 🐟, "Veganos" → 🌱.

10. **Página de produto usa TanStack Query**: `useQuery` com key `['product', handle]` para produto e `['related-products', productType]` para relacionados.

11. **Collection page**: Usa mapeamento fixo de slug para productType em `CATEGORIES`. Carrega 50 produtos e filtra por type no frontend.

## Fluxo do usuário

### Homepage (/)
1. Usuário acessa a homepage
2. Hero com CTAs "Montar meu Kit da Semana" e "Ver todos os pratos"
3. BenefitsBar mostra diferenciais (sem conservantes, pronto em 5min, congelado artesanal)
4. QuickCategories → botões para cada categoria
5. Favorites → pratos mais pedidos
6. AllDishes → grid com filtro por categoria e botão "Adicionar" em cada card
7. Clique no card → `/produto/:handle`
8. Clique em "Adicionar" → addItem no cartStore

### Cardápio (/cardapio)
1. FullMenu carrega 50 produtos via Shopify Storefront API
2. Produtos agrupados por `productType`
3. Header mostra total de pratos e quantidade exibida
4. Barra de filtros: busca (debounce 400ms), ordenação, botões de categoria
5. Grid com cards: imagem, título, descrição truncada, preço, botão adicionar
6. Animações Framer Motion (fade in, layout animation)
7. Loading → Skeleton, erro → botão "Tentar novamente"

### Produto (/produto/:handle)
1. Busca produto por handle via `PRODUCT_BY_HANDLE_QUERY` (TanStack Query)
2. Galeria de imagens com thumbnails clicáveis
3. Breadcrumb: Home > productType > título
4. Badges de tag, preço com desconto Pix (5%)
5. Seletor de quantidade (mín 1)
6. Botão "ADICIONAR" e "COMPRAR AGORA"
7. Calculadora de frete (UI placeholder, sem integração)
8. Trust badges, Accordions (Ingredientes, Alérgicos, Modo de preparo)
9. ProductComposition, Produtos relacionados por productType

## Integrações
| Integração | Tipo | Endpoint | O que faz |
|-----------|------|----------|-----------|
| Shopify Storefront API | GraphQL | /api/2025-07/graphql.json | Busca produtos, produto por handle |

## Gotchas e armadilhas
- O `PRODUCTS_QUERY` busca até 50 produtos — precisa de paginação cursor-based se crescer
- A busca do FullMenu filtra no frontend APÓS carregar todos os produtos — não usa a query da API para filtrar
- O `productType` do Shopify é a categoria — se errar no Shopify Admin, o produto fica na categoria errada
- As avaliações (`ProductReviews`) são UI estática — sem sistema real de reviews
- A calculadora de frete na página de produto é placeholder — sem integração
- O `sku` não existe nos dados — usa últimos 6 chars do ID Shopify como fallback
- As imagens dependem do CDN Shopify — se a store expirar, as imagens quebram
- O header search redireciona para `/cardapio?search=query` mas FullMenu lê `searchParams` para category, não para search — a busca funciona via estado local do componente
