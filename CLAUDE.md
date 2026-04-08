# Jilo Replica Prime — E-commerce de Marmitas Artesanais

## Visão geral
E-commerce da marca Jilo (DaJu Alimentação) — marmitas artesanais congeladas. Frontend em React + TypeScript hospedado no Lovable, catálogo e checkout via Shopify Storefront API, dados de usuário no Supabase.

## Stack
- React 18 + TypeScript strict + Vite + Tailwind CSS + shadcn/ui
- State: Zustand (carrinho) + TanStack Query (dados de API)
- Backend: Supabase (auth + profiles) + Shopify Storefront API (produtos + carrinho + checkout)
- UI: DM Sans (corpo) + DM Serif Display (títulos) + paleta verde escuro (#1E3A1E) + off-white (#FAF7F2)
- Testes: Vitest + Testing Library
- Animações: Framer Motion

## Comandos
- `npm run dev` — dev server
- `npm run build` — build de produção
- `npm run test` — testes unitários
- `npm run seed` — seed de produtos no Shopify (requer SHOPIFY_ADMIN_TOKEN)
- `npm run seed:collections` — criação de collections no Shopify

## Rotas
| Rota | Página | Descrição |
|------|--------|-----------|
| `/` | Index | Homepage com hero, favoritos, cardápio, kits, depoimentos, FAQ |
| `/cardapio` | Cardapio | Catálogo completo com filtro por categoria, busca e ordenação |
| `/produto/:handle` | Product | Página de produto com galeria, variantes, add to cart, composição |
| `/colecao/:categoria` | Collection | Lista de produtos por collection (categoria) |
| `/carrinho` | Carrinho | Página de carrinho completa com resumo, cupom, frete, sugestões |
| `*` | NotFound | 404 |

## Arquitetura de dados
- **Produtos**: Shopify Storefront GraphQL API (store: jnutg9-u2.myshopify.com)
- **Carrinho**: Shopify Cart API via mutations GraphQL, estado local em Zustand + localStorage
- **Checkout**: Redirect para checkout Shopify (checkoutUrl do cart)
- **Perfil de usuário**: Supabase auth + tabela `profiles` (endereço, CPF, telefone)
- **NÃO há tabelas de produtos/pedidos no Supabase** — tudo via Shopify

## Documentação de fluxos
- `.claude/fluxo-infraestrutura.md` — Stack, padrões, banco de dados
- `.claude/fluxo-catalogo-produtos.md` — Listagem, filtro, busca de produtos
- `.claude/fluxo-carrinho-checkout.md` — Carrinho, cupom, frete e checkout via Shopify
- `.claude/fluxo-perfil-usuario.md` — Perfil de usuário no Supabase

## Regra de atualização
Sempre que uma sessão do Claude Code modificar um fluxo documentado, ela DEVE atualizar o arquivo `.claude/` correspondente com as mudanças feitas. Se um novo fluxo for criado, criar o arquivo `.claude/fluxo-[nome].md` e registrar aqui.

## Gotchas globais
- O catálogo NÃO está no Supabase — está no Shopify. Qualquer mudança em produtos é feita via Shopify Admin ou scripts de seed.
- O Storefront Access Token está hardcoded em `src/lib/shopify.ts` — é um token público (Storefront), mas deve ser movido para .env em produção.
- O carrinho sincroniza com Shopify Cart API — se o cart expirar no Shopify, o store local limpa automaticamente (`cartNotFound` handler).
- Pix com 5% de desconto é calculado no frontend (multiplicação por 0.95) — NÃO é um desconto real no Shopify.
- A tabela `profiles` no Supabase tem RLS ativa — cada usuário só vê/edita o próprio perfil.
- O projeto foi criado no Lovable — não altere a estrutura de pastas sem necessidade.
- O cupom BEMVINDO10 é hardcoded no frontend (desconto fixo R$10) — não há validação server-side.
- O frete grátis é ativado para compras acima de R$150 — lógica no frontend, não no Shopify.
- O checkout redireciona para Shopify — descontos de cupom e PIX do frontend NÃO são refletidos lá.
