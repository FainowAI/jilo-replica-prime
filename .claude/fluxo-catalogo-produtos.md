# Fluxo: Catálogo de Produtos

## Visão geral
O catálogo da Jilo exibe marmitas artesanais organizadas em 4 categorias: Aves e Suinos, Bovinos, Peixes e Massas, Veganos. Todos os dados vêm da Shopify Storefront API via GraphQL — NÃO há tabela de produtos no Supabase.

## Arquivos envolvidos

### Páginas
| Arquivo | Rota | Descrição |
|---------|------|-----------|
| `src/pages/Index.tsx` | `/` | Homepage — monta as seções incluindo Favorites, AllDishes, QuickCategories |
| `src/pages/Cardapio.tsx` | `/cardapio` | Página de cardápio completo — wrapper para FullMenu |
| `src/pages/Product.tsx` | `/produto/:handle` | Página de detalhe do produto |
| `src/pages/Collection.tsx` | `/colecao/:categoria` | Lista filtrada por collection/categoria |

### Componentes-chave
| Arquivo | Descrição |
|---------|-----------|
| `src/components/sections/FullMenu.tsx` | Componente principal do catálogo — grid de produtos com filtro por categoria, busca com debounce (400ms), ordenação (relevância, alfabética, menor/maior preço, maior desconto) |
| `src/components/sections/Favorites.tsx` | Seção "Os favoritos da galera" na homepage — puxa os mais pedidos |
| `src/components/sections/AllDishes.tsx` | Seção "Monte o Kit da sua Semana" na homepage — grid completo com filtro por categoria |
| `src/components/sections/QuickCategories.tsx` | Botões de categoria rápida na homepage |
| `src/components/sections/Hero.tsx` | Banner principal com CTAs |
| `src/components/sections/ProductComposition.tsx` | Seção de composição do produto na página de detalhe |
| `src/components/sections/ProductDetails.tsx` | Detalhes expandidos do produto |
| `src/components/sections/ProductReviews.tsx` | Avaliações do produto (UI estática) |
| `src/components/sections/RelatedProducts.tsx` | "Quem viu, comprou" — produtos relacionados por productType |

### Lib
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/shopify.ts` | Client Shopify — storefrontApiRequest(), queries GraphQL, mutations de cart, tipos ShopifyProduct |

## Tabelas do banco
Nenhuma. Produtos são gerenciados 100% pelo Shopify.

## Regras de negócio

1. **Categorias fixas em ordem**: O `CATEGORY_ORDER` no FullMenu define a ordem: `["Aves e Suinos", "Bovinos", "Peixes e Massas", "Veganos"]`. Categorias fora dessa lista aparecem no final.

2. **Busca com debounce**: O FullMenu tem busca com debounce de 400ms — o `searchInput` é separado do `searchQuery` usado na filtragem. A busca filtra por título do produto E por nome da categoria.

3. **Ordenação**: 5 opções — Relevância (padrão/API order), Ordem alfabética, Mais vendidos (mesmo que relevância), Menor preço, Maior preço. O "Maior desconto" compara `compareAtPrice` com `price`.

4. **Filtro por categoria**: Via search params na URL (`?category=Bovinos`). "Todos" remove o param.

5. **Tags como badges**: O sistema de badges usa tags do Shopify — `mais-pedido` → "⭐ Mais pedido" (amarelo), `vegano` → "🌱 Vegano" (verde), `low-carb` → "Low Carb", `novo` → "Novo". Prioridade é a primeira match.

6. **Preço no Pix**: Na página de produto, o preço com Pix é calculado como `price * 0.95` (5% de desconto). Isso é puramente frontend — não existe desconto real no Shopify.

7. **Produtos carregados em batch**: O FullMenu carrega até 50 produtos por vez (`first: 50`).

8. **Categorias por productType**: Os produtos são agrupados pelo campo `productType` do Shopify, NÃO por collections.

9. **Emojis por categoria**: Mapeamento fixo — "Aves e Suinos" → 🍗, "Bovinos" → 🥩, "Peixes e Massas" → 🐟, "Veganos" → 🌱.

## Fluxo do usuário

### Homepage (/)
1. Usuário acessa a homepage
2. Vê Hero com CTAs "Montar meu Kit da Semana" e "Ver todos os pratos"
3. BenefitsBar mostra diferenciais (sem conservantes, pronto em 5min, congelado artesanal)
4. QuickCategories mostra botões para cada categoria
5. Favorites mostra os pratos mais pedidos
6. AllDishes mostra grid com filtro por categoria e botão "Adicionar" em cada card
7. Clique no card leva para `/produto/:handle`
8. Clique em "Adicionar" adiciona ao carrinho via cartStore

### Cardápio (/cardapio)
1. Usuário acessa /cardapio
2. FullMenu carrega 50 produtos via Shopify Storefront API
3. Produtos são agrupados por `productType` (categoria)
4. Header mostra total de pratos e quantidade exibida
5. Barra de filtros: busca (debounce 400ms), ordenação (5 opções), botões de categoria
6. Grid exibe cards com imagem, título, descrição truncada, preço, botão adicionar
7. Animações com Framer Motion (fade in no scroll, layout animation)
8. Estado de loading com Skeleton, erro com botão "Tentar novamente"

### Produto (/produto/:handle)
1. Busca produto por handle via `PRODUCT_BY_HANDLE_QUERY`
2. Galeria de imagens com thumbnails clicáveis
3. Breadcrumb: Home > productType > título
4. Badges de tag (mais pedido, vegano, etc.)
5. Preço com desconto Pix (5%), badge "5% off para pagamentos no pix"
6. Seletor de quantidade (mín 1)
7. Botão "ADICIONAR" ao carrinho
8. Calculadora de frete (UI apenas, sem integração de CEP)
9. Trust badges: Compra segura, Entregue gelado, Sem conservantes
10. Accordions: Ingredientes, Alérgicos, Modo de preparo
11. ProductComposition (composição visual do prato)
12. Produtos relacionados ("Quem viu, comprou") — filtra por mesmo productType

## Integrações
| Integração | Tipo | Endpoint | O que faz |
|-----------|------|----------|-----------|
| Shopify Storefront API | GraphQL | /api/2025-07/graphql.json | Busca produtos, produto por handle, produtos por query |

## Gotchas e armadilhas
- O `PRODUCTS_QUERY` busca até 50 produtos — se o cardápio crescer além disso, precisa de paginação (cursor-based)
- A busca do FullMenu filtra no frontend APÓS carregar todos os produtos — não usa a query da API para filtrar
- O `productType` do Shopify é a categoria — se alguém errar o tipo no Shopify Admin, o produto fica na categoria errada ou em "Outros"
- A seção de avaliações (`ProductReviews`) é UI estática — não há sistema real de reviews
- A calculadora de frete não tem integração — é apenas UI placeholder
- O campo `sku` não existe nos dados — o código do produto usa os últimos 6 chars do ID Shopify como fallback
- As imagens dependem do CDN Shopify — se a store expirar, as imagens quebram
