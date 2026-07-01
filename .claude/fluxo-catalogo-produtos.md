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
| `src/hooks/useProductSearch.ts` | Hook de busca de produtos (usado pelo dropdown de resultados do Header) — `normalizeSearch()` (remove acento + lowercase) e `useProductSearch(term, limit)`: busca o catálogo completo 1x via TanStack Query (`queryKey: ["catalog-all-products"]`, `staleTime` 5min) e filtra client-side por título/productType |

## Tabelas do banco
Nenhuma. Produtos são gerenciados 100% pelo Shopify.

## Regras de negócio

1. **Categorias fixas em ordem**: `CATEGORY_ORDER` no FullMenu define: `["Aves e Suinos", "Bovinos", "Peixes e Massas", "Veganos"]`. Categorias fora dessa lista aparecem no final.

2. **Busca com debounce**: O FullMenu tem busca com debounce de 400ms — `searchInput` é separado do `searchQuery`. A busca filtra por título do produto E por nome da categoria, usando `normalizeSearch` (remove acento + lowercase, de `src/hooks/useProductSearch.ts`) para match tolerante e parcial. A filtragem é no frontend APÓS carregar todos os produtos (o fetch NÃO manda o termo para a query da Shopify — busca o catálogo completo 1x). O `FullMenu` inicializa `searchInput`/`searchQuery` a partir de `?search=` na URL e reage a mudanças desse param (navegação vinda da navbar com o componente já montado).

3. **Ordenação**: 5 opções — Relevância (padrão), Ordem alfabética, Mais vendidos (mesmo que relevância), Menor preço, Maior preço. "Maior desconto" compara `compareAtPrice` com `price`.

4. **Filtro por categoria**: Via search params na URL (`?category=Bovinos`). "Todos" remove o param. Header search redireciona para `/cardapio?search=query`, que agora é lido pelo FullMenu (ver regra 2). O Header também mostra um dropdown de resultados (até 6 produtos, imagem + título + preço) direto na barra de busca expansível, via `useProductSearch` (`src/hooks/useProductSearch.ts`) — busca client-side sobre o catálogo completo, sem round-trip por tecla.

5. **Tags como badges**: Sistema de badges usa tags do Shopify — `mais-pedido` → "⭐ Mais pedido" (amarelo), `vegano` → "🌱 Vegano" (verde), `low-carb` → "Low Carb", `novo` → "Novo". Prioridade é a primeira match.

6. **Preço no Pix**: Na página de produto, o preço com Pix = `price * 0.95` (5% off). Puramente frontend — sem desconto real no Shopify.

7. **Produtos carregados em batch**: FullMenu carrega até 50 produtos (`first: 50`). Se o catálogo crescer, precisa de paginação cursor-based.

8. **Categorias por productType**: Produtos agrupados pelo campo `productType` do Shopify, NÃO por collections.

9. **Emojis por categoria**: Mapeamento fixo — "Aves e Suinos" → 🍗, "Bovinos" → 🥩, "Peixes e Massas" → 🐟, "Veganos" → 🌱.

10. **Página de produto usa TanStack Query**: `useQuery` com key `['product', handle]` para produto e `['related-products', productType]` para relacionados.

11. **Collection page**: Usa mapeamento fixo de slug para productType em `CATEGORIES`. Carrega 50 produtos e filtra por type no frontend.

12. **Metafields dinâmicos na página de produto**: A query `PRODUCT_BY_HANDLE_QUERY` busca 7 metafields customizados do Shopify (custom.proteina, custom.base, custom.guarnicao, custom.alergicos, custom.modo_preparo, custom.peso, custom.conservacao). Esses dados populam a seção "O que tem na sua marmita" (ProductComposition) e os Accordions (Ingredientes, Alérgicos, Modo de preparo) na página de detalhe.

13. **Fallback por productType**: Se um produto NÃO tem metafields preenchidos, o sistema usa os dados hardcoded em `INGREDIENT_DATA` e `DEFAULT_DATA` dentro de `ProductComposition.tsx`, mapeados por productType. A função `getIngredientText()` em `Product.tsx` também serve como fallback para o Accordion de ingredientes.

14. **Formato dos metafields multi-line**: Campos como proteina, base e guarnicao usam `\n` como separador de itens. O frontend faz `.split('\n').filter(Boolean)` para renderizar cada linha como item separado.

15. **compareAtPrice riscado no FullMenu**: O grid de pratos do FullMenu exibe o `compareAtPrice` riscado antes do preço atual quando disponível e maior que o preço de venda.

16. **Storytelling nos cards (Sprint 2)**: Cards no FullMenu mostram uma linha dourada abaixo da descrição: "5 min no micro · {sugestão por categoria}". Sugestões por `productType` definidas em `CATEGORY_SUGGESTIONS` (ex: "Aves e Suinos" → "Ideal para o jantar da semana"). Fallback: "Feito de verdade".

17. **Bloco "Como preparar" na página de produto (Sprint 2)**: Antes dos Accordions, um box com 4 passos genéricos de preparo (freezer → micro → 5min → pronto). Se o produto tiver o metafield `custom.modo_preparo` preenchido, os passos do metafield são usados em vez do genérico.

18. **Sugestão de consumo no ProductComposition (Sprint 2)**: Após a grid de ingredientes (proteína + base + guarnição), um texto em itálico com sugestão de consumo por `productType` definida em `CONSUMPTION_SUGGESTIONS`. Ex: "Peixes e Massas" → "Sugestão: sirva com limão espremido na hora. Sabor ainda melhor!". Fallback: "acompanha bem com uma salada verde ou suco natural".

16. **WeeklyKits busca Collections do Shopify**: O componente `WeeklyKits.tsx` busca preço mínimo de cada Collection via `COLLECTION_BY_HANDLE_QUERY` para exibir preço real nos cards de kit. Cada card linka para `/kit/:slug`.

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
- O header search redireciona para `/cardapio?search=query` e o FullMenu lê `?search=` para inicializar/sincronizar a busca local (via `useEffect` reagindo a `searchParams.get("search")`).
- Os metafields só são buscados na query `PRODUCT_BY_HANDLE_QUERY` (página de detalhe). Listagens (FullMenu, Favorites, AllDishes) NÃO carregam metafields — isso é intencional para performance.
- Se um novo metafield for adicionado no Shopify, a query em `shopify.ts` precisa ser atualizada manualmente para incluí-lo no array `identifiers`.
- O checkbox "Acesso à API Storefront" DEVE estar ativo no Shopify Admin para cada metafield definition — sem isso a Storefront API retorna null.
- Metafields retornam null (não undefined) quando não preenchidos — os fallbacks usam `||` que trata ambos.
