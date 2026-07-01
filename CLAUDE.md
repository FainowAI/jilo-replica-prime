# Jilo Replica Prime — E-commerce de Marmitas Artesanais

## Visão geral
E-commerce da marca Jilo (DaJu Alimentação) — marmitas artesanais congeladas. Frontend em React + TypeScript hospedado no Lovable, catálogo e checkout via Shopify Storefront API, dados de usuário no Supabase.

## Desenvolvimento orientado a sub-agentes (REGRA PERMANENTE — sempre aplicar)
Este projeto prioriza **sub-agent driven development**. Para qualquer tarefa de implementação não-trivial (feature, aba, campo, migration, correção de bug, mudança de regra/cálculo/permissão), **orquestre sub-agentes em vez de fazer tudo no contexto principal**. A skill `/feature-builder` é o ponto de entrada padrão e já descreve os sub-agentes e o fluxo (planeja → aprova → executa pelo método ponytail).

Sub-agentes disponíveis (via Agent tool) e quando despachar:
- **code-explorer** — mapear código existente numa área grande/desconhecida antes de editar (read-only).
- **data-architect** — desenhar schema/tipos/RLS e blueprint de migração, inspecionando o banco real via MCP (não aplica migration).
- **feature-coder** — implementar tracks de código independentes em paralelo, dentro de escopo definido.
- **security-auditor** — auditar RLS/RBAC/PII/segurança após mudanças sensíveis.

Como aplicar:
1. **Default é despachar, não fazer inline.** Se a tarefa toca mais de um arquivo/área ou tem fases (mapear → desenhar → codar → auditar), use sub-agentes. Trabalho inline só para edições mecânicas triviais e perguntas conceituais.
2. **Paralelize tracks independentes** — múltiplos `feature-coder` na mesma mensagem para rodarem concorrentemente; nunca serialize o que pode ser paralelo.
3. **Cada sub-agente recebe um brief autocontido** — arquivos-alvo, padrões a seguir, regras de negócio já validadas e o que NÃO tocar. Sub-agente não inventa regra de negócio.
4. **Prefira `/feature-builder`** para iniciar qualquer execução de EAP/feature — ela já dispara o gate de regras de negócio e a orquestração.

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
| `/kits` | Kits | Hub dedicado de kits — hero de engajamento, desconto progressivo e grade (reusa WeeklyKits) |
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
- `.claude/fluxo-kits.md` — Kits temáticos e Kit Livre, descontos progressivos
- `.claude/fluxo-validacao-cep.md` — Validação de CEP via ViaCEP, whitelist de áreas atendidas
- `.claude/fluxo-analytics.md` — PostHog (produto): gate prod-only, eventos do funil, masking de PII

## Regra de atualização
Sempre que uma sessão do Claude Code modificar um fluxo documentado, ela DEVE atualizar o arquivo `.claude/` correspondente com as mudanças feitas. Se um novo fluxo for criado, criar o arquivo `.claude/fluxo-[nome].md` e registrar aqui.

## Segurança de RLS (REGRA PERMANENTE — sempre aplicar)
Toda tabela no schema `public` do Supabase contém ou pode conter dados de usuário (PII) e DEVE estar protegida por RLS. Ao criar ou alterar qualquer tabela/policy:

1. **Sempre** habilitar RLS: `ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;`. Sem policy + RLS ativa = deny-all (correto). RLS desativada = vazamento total.
2. **Sempre** declarar o role com `TO` em cada policy. Uma policy **sem `TO` recai sobre `PUBLIC`** (inclui `anon`) — foi exatamente isso que vazou `orders` e `webhook_events` (`USING(true)` sem `TO` → acesso público total). Use `TO authenticated` para dados de usuário; nunca deixe `anon` com `USING(true)`.
3. **NUNCA** crie policy `USING(true)`/`WITH CHECK(true)` para `PUBLIC`/`anon`/`authenticated`. O `service_role` **ignora RLS** (BYPASSRLS) — edge functions com `SUPABASE_SERVICE_ROLE_KEY` já têm acesso total **sem precisar de policy**. Logo, "dar acesso ao service_role" via policy é desnecessário e tipicamente abre a tabela para todos por engano.
4. Dados de usuário (`profiles`, `orders`, `addresses`, `order_items`, `order_status_history`): policies escopadas a `authenticated` com `auth.uid() = <coluna_dono>` (direto ou via JOIN).
5. Tabelas só de backend (`webhook_events`, `shopify_admin_tokens`): sem acesso a `anon`/`authenticated` — deny explícito (`USING(false)`) e acesso só via service_role.
6. **Lembre-se:** uma resposta `200 []` (array vazio) com a anon key é o comportamento CORRETO e seguro do RLS — o PostgREST não retorna 403, retorna lista vazia. Vazamento de verdade é `200` retornando **linhas**. Para auditar, simule: `set local role anon; select count(*) from public.<t>;` deve dar 0 para tabelas de usuário.
7. Após qualquer migration que mexa em tabelas/policies, rode `get_advisors(type: security)` e confira que nenhuma tabela ficou exposta.

## Gotchas globais
- O catálogo NÃO está no Supabase — está no Shopify. Qualquer mudança em produtos é feita via Shopify Admin ou scripts de seed.
- O Storefront Access Token está hardcoded em `src/lib/shopify.ts` — é um token público (Storefront), mas deve ser movido para .env em produção.
- O carrinho sincroniza com Shopify Cart API — se o cart expirar no Shopify, o store local limpa automaticamente (`cartNotFound` handler).
- Pix com 5% de desconto é calculado no frontend (multiplicação por 0.95) — NÃO é um desconto real no Shopify.
- A tabela `profiles` no Supabase tem RLS ativa — cada usuário só vê/edita o próprio perfil (policies escopadas a `authenticated`). Veja a seção "Segurança de RLS".
- O projeto foi criado no Lovable — não altere a estrutura de pastas sem necessidade.
- O cupom BEMVINDO10 é hardcoded no frontend (desconto fixo R$10) — não há validação server-side.
- O frete grátis é ativado para compras acima de R$150 — lógica no frontend, não no Shopify.
- O checkout redireciona para Shopify — descontos de cupom e PIX do frontend NÃO são refletidos lá.
