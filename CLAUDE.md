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
- **Catálogo NÃO está no Supabase** — produtos e carrinho vêm da Shopify. Pedidos: a Shopify é a fonte; o webhook `shopify-webhook-receiver` espelha em `orders`/`order_items` para Uber e painel próprio (ver `.claude/fluxo-carrinho-checkout.md`)

## Documentação de fluxos
- `.claude/fluxo-infraestrutura.md` — Stack, padrões, banco de dados
- `.claude/fluxo-catalogo-produtos.md` — Listagem, filtro, busca de produtos
- `.claude/fluxo-carrinho-checkout.md` — Carrinho, cupom, frete e checkout via Shopify
- `.claude/fluxo-perfil-usuario.md` — Perfil de usuário no Supabase
- `.claude/fluxo-kits.md` — Kits temáticos e Kit Livre, descontos progressivos
- `.claude/fluxo-validacao-cep.md` — Validação de CEP via ViaCEP, whitelist de áreas atendidas
- `.claude/fluxo-analytics.md` — PostHog (produto): gate prod-only, eventos do funil, masking de PII
- `.claude/fluxo-bling.md` — Bling (ERP/nota fiscal) ↔ Shopify: integração nativa, mapeamento de pedidos, bloqueios fiscais
- `.claude/adr/` — decisões de arquitetura (0001: Cielo conector + Alelo via API)

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
- Pix 5% = cupom real `PIX5` (classe ORDER, incide no frete) aplicado no cart via `cartDiscountCodesUpdate`; o front só espelha `cart.cost.totalAmount` (R79/R80). O "Pix 5%" nos cards de produto é só preview (×0,95).
- A tabela `profiles` no Supabase tem RLS ativa — cada usuário só vê/edita o próprio perfil (policies escopadas a `authenticated`). Veja a seção "Segurança de RLS".
- O projeto foi criado no Lovable — não altere a estrutura de pastas sem necessidade.
- Cupons (BEMVINDO10 etc.) são códigos da Shopify validados server-side via `cartDiscountCodesUpdate`; nada é hardcoded no front.
- Frete grátis a partir de 7 marmitas (R34, `src/config/shipping.ts`); abaixo disso, cotação Uber Direct cobrada por uma variante fantasma no cart. Os produtos DEVEM ficar com `requiresShipping: false` na Shopify (Path B) — se alguém marcar "produto físico" no Admin, o checkout passa a cobrar a taxa nativa "Padrão" (R$ 22) por cima. Foi o que aconteceu em set/2026; ver `.claude/fluxo-carrinho-checkout.md`.
- O checkout redireciona para Shopify; o `checkoutUrl` é assinado com o estado do cart e DEVE ser renovado (`refreshCartDetails`) depois de qualquer mutação (R80). Antes do redirect o cart recebe `buyerIdentity` com e-mail/telefone do login (R81) — sem isso o pedido cai em outro customer e some de "Meus pedidos".
- `customerCreate` da Admin API NÃO aceita `identifier`: o vínculo cliente↔Shopify é busca por e-mail + `customerUpdate`/`customerCreate` (`_shared/shopify-customer-upsert.ts`). Esse bug deixou 0/22 usuários Google sem `shopify_customer_id` até 2026-10-09.
- Cielo: a Getnet FICA no checkout Shopify (cartão + Pix) — a Shopify só aceita um provedor de cartão ativo, então NÃO ativar o app "Cielo Creditcard" (removeria a Getnet). A Cielo serve ao Alelo, que é integração própria (`cielo-checkout`, molde VR) atrás de `VITE_ALELO_ENABLED` + `ALELO_ENABLED`. A Cielo NÃO deduplica `MerchantOrderId` e Alelo só cancela total no D0 — ver R86–R90 e ADR 0001. Cartão Alelo só via Silent Order Post (nunca PAN no backend).
- Bling usa a integração nativa (sem código no repo; `orders.bling_*` são colunas mortas). Nunca mapear pedido não pago para "Cancelado" no Bling: o cancelamento volta para a Shopify e notifica o cliente. Ver `fluxo-bling.md`.
- "Meus pedidos" NÃO lê `orders`: a edge `customer-orders` consulta a Admin API por `customer_id` e cai para `email:` se vier vazio. `orders`/`order_items` são espelho só para Uber/operação.
