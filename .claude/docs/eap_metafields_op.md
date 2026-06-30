# EAP — Enriquecimento de Metafields Operacionais · Jiló (DaJu Alimentação)

> Estrutura Analítica de Projeto (EAP/WBS) para a fase de **enriquecimento de dados operacionais na Shopify** do ecossistema Jiló.
> **Não é projeto novo** — é uma fase de iteração sobre a plataforma em produção (branch `main`, repo `FainowAI/jilo-replica-prime`).
> Espelha para o admin Shopify os dados operacionais que hoje vivem só no Supabase: **classificação de cliente, método de entrega, faixa de marmitas e flag de logística.**
> Fainow · Laboratório de Soluções · Junho 2026 · Baseado em leitura do código real + regras vivas (R64–R78) + pesquisa de implementação (Shopify metafields/tags/segments).

---

## 1. Resumo executivo

O cliente (DaJu/Jiló) opera o negócio pelo **admin da Shopify** e não acessa o Supabase. A fase anterior (*Visibilidade de Dados*, junho/2026) já espelhou os dados **nativos** do cliente (nome, e-mail, telefone, endereço) e habilitou a captação de pedidos. Esta fase espelha os dados **operacionais customizados** — classificação de cliente, método de entrega, faixa de marmitas e flags de logística — usando **metafields** e **tags** da Shopify, que se tornam filtros, segmentos e informação visível na página de cliente/pedido do admin.

**Tipo:** Agente/Automação (camada de integração backend sobre produto existente).
**Diferencial:** zero PII em metafield (restrição R65/LGPD); reaproveita os dois pontos de escrita já existentes (`shopify-customer-sync` + `shopify-webhook-receiver`) e o OAuth Admin já implementado — é espelho de dado que já temos, não derivação nova.
**Prazo estimado:** ~5–7 dias úteis com QA e backfill (×1.5 por integração de terceiro).
**Stack tocada:** Supabase Edge Functions (Deno), Shopify Admin GraphQL API (2025-10), OAuth client_credentials.

---

## 2. Decisões travadas (gate de negócio — validadas com o cliente)

| # | Decisão | Valor |
|---|---------|-------|
| D1 | Régua de classificação de cliente | Por **contagem de pedidos**: `cliente-novo` (0–1), `recorrente` (2+), `vip` (5+ pedidos **OU** 1+ kit de 28) |
| D2 | Como gravar a classificação | **Customer metafield** `custom.classificacao` **+ tag espelhada** (a tag é o que vira segmento nativo no admin) |
| D3 | Order: metafield vs tag | **Metafield** para método de entrega e faixa de marmitas; **tag** para flag operacional (filtro de lista de pedidos) |
| D4 | Quando gravar metafield de pedido | **Só no `orders/paid`** (onde os dados de entrega já estão consolidados — R68 / Sprint 4.1), com upsert defensivo existente cobrindo corrida com `create` |
| D5 | PII em metafield | **PROIBIDO** (R65 / LGPD) — CPF, e-mail, telefone, nome nunca entram em metafield/tag |
| D6 | Backfill | **Incluído** — customers e pedidos existentes recebem enriquecimento retroativo |
| D7 | Autenticação de escrita | OAuth client_credentials já implementado (`getShopifyAdminToken`, `_shared/shopify-admin-auth.ts`) |
| D8 | Frontend | **Nenhum** — backend/edge puro; o "painel" é o próprio admin Shopify |

---

## 3. Diagnóstico (estado real, lido ao vivo)

| Fonte | Achado | Implicação para esta fase |
|-------|--------|---------------------------|
| Código | `shopify-customer-sync` já envia campos **nativos** + endereço (R64–R66) | Ponto de escrita do **customer** já existe — só estender com metafield/tag |
| Código | `shopify-webhook-receiver` popula campos de entrega em `orders/paid` (R68) | Ponto de escrita do **order** já existe — `delivery_method` etc. já disponíveis no handler |
| Código | OAuth Admin via `getShopifyAdminToken()` já em produção | Escrita de metafield reaproveita auth existente — sem trabalho de auth |
| Regra | **R65 proíbe PII em metafield** | Fronteira dura: classificação e entrega OK; CPF/contato jamais |
| Estado | **Webhooks nunca foram disparados** → `orders`/`webhook_events` vazias | Dependência herdada: sem pedido entrando, não há order para enriquecer (4.1.2) |
| Estado | `SHOPIFY_ADMIN_TOKEN` **inválido (401)** + exposto em texto puro | Dependência herdada: rotacionar antes do backfill em massa (4.1.1) |
| Supabase | Dados de entrega já existem (`delivery_method`, `shipping_fee_cents`, contagem de itens) | Fase é **espelho**, não derivação do zero |

**Leitura estratégica:** a plumbing de escrita já existe nos dois lados. Esta fase é predominantemente de **extensão de payload** (adicionar metafields/tags às mutations já em uso) + **definições no admin** + **backfill** — não construção de fundação.

### 3.1 Auditoria de saúde do customer-sync (validada ao vivo — junho/2026)

Antes de empilhar metafields, medimos a taxa de sucesso real do sync. O headline "6/6 sincronizados" esconde nuances:

| Peça do sync | Resultado real | Leitura |
|---|---|---|
| Customer criado (`shopify_customer_id`) | 6/6 (100%) | ✅ mas **todos via backfill manual de 26/06** — não pelo gatilho orgânico |
| Tags `jilo-customer`/`source:supabase` | 6/6 (100%) | ✅ funciona |
| Endereço nativo | 5/6 (83%) | ⚠️ o 6º não tem endereço no Supabase (esperado) |
| **Telefone** | **0/6 (0%)** | 🔴 nenhum customer tem phone; só 1 profile tem phone na origem, e nem esse propagou |

**Três achados que motivaram o Módulo 0:**

1. **Sem caminho de atualização.** A função faz early-return `already_synced` assim que `shopify_customer_id` existe. Como os 6 já têm ID, ela **nunca mais atualiza nada** para eles — telefone, endereço ou metafields futuros. Idempotência é por *presença do ID*, não por *mudança de dado*. Qualquer enriquecimento novo nasce morto para a base atual se rodar depois desse early-return.
2. **Sync orgânico nunca exercitado.** Todos os 6 profiles têm `updated_at` em 26/06 (data do backfill). Nenhum cadastro real disparou o sync em produção desde então — o "100%" é do backfill da Fainow, não do fluxo automático.
3. **Divergência de config.** A função está deployada com `verify_jwt: false`, mas a doc afirma `verify_jwt: true`. Há validação de JWT no corpo do código (não é buraco aberto), mas config real ≠ documentada.

> **Conclusão:** a fundação está **parcialmente comprovada**. O Módulo 0 corrige o caminho de atualização, reconcilia o telefone, alinha a config e valida o sync orgânico — pré-requisito antes de qualquer metafield.

---

## 4. EAP — 3 níveis

```
0. Enriquecimento de Metafields Operacionais — Jiló
│
├── 0. Hardening & validação da fundação (sync de cliente)     [frente: edge customer-sync]  ★ NOVO
│   ├── 0.1 Corrigir o caminho de ATUALIZAÇÃO do sync
│   │     ├── 0.1.1 Separar criar-vs-atualizar: hoje o early-return por shopify_customer_id pula TUDO
│   │     │         para quem já tem ID (telefone/endereço/metafields nunca atualizam). Introduzir
│   │     │         caminho de update idempotente que roda mesmo com customer já existente.
│   │     └── 0.1.2 Reconciliar telefone: 0/6 customers têm phone na Shopify; quando o profile
│   │               tiver phone, propagar via customerUpdate (hoje só vai no create, que não roda mais).
│   ├── 0.2 Corrigir divergência de configuração
│   │     └── 0.2.1 Alinhar verify_jwt real (deploy = false) com a doc (afirma true). Decidir o correto,
│   │               aplicar e atualizar fluxo-shopify-sync.md (validação de JWT existe no corpo do código).
│   └── 0.3 Validar o sync ORGÂNICO (nunca exercitado em produção)
│         ├── 0.3.1 Teste de cadastro real ponta-a-ponta: signup novo → SIGNED_IN dispara sync →
│         │         customer nasce com nome/telefone/endereço/tags (os 6 atuais são backfill manual)
│         └── 0.3.2 Confirmar nos logs que o gatilho dispara e completa (não só already_synced)
│
├── 1. Definições de Metafield & Tag (fundação Shopify)        [frente: config Admin]
│   ├── 1.1 Definições de Customer metafield
│   │     └── 1.1.1 Criar definition custom.classificacao (single_line_text, pinned, filtrável)
│   ├── 1.2 Definições de Order metafield
│   │     ├── 1.2.1 Criar definition custom.metodo_entrega (single_line_text, pinned)
│   │     └── 1.2.2 Criar definition custom.faixa_marmitas (single_line_text, pinned)
│   └── 1.3 Convenção de tags
│         └── 1.3.1 Documentar vocabulário FIXO de tags (classe-cliente + flag-operacional)
│
├── 2. Enriquecimento de Customer (classificação)              [frente: edge customer-sync]
│   ├── 2.1 Lógica de classificação
│   │     ├── 2.1.1 Função pura classifyCustomer(orderCount, hasKit28) → enum de classe
│   │     └── 2.1.2 Fonte da contagem: query orders por customer (Supabase service_role)
│   ├── 2.2 Escrita no customer-sync
│   │     ├── 2.2.1 Estender shopify-customer-sync: gravar metafield custom.classificacao (metafieldsSet)
│   │     │         ⚠️ DEPENDE de 0.1.1 — hoje o early-return pula tudo p/ quem já tem ID; o metafield
│   │     │         tem de rodar no caminho de update, senão nasce morto para os 6 customers atuais
│   │     └── 2.2.2 Espelhar classificação como tag (tagsAdd + remover tag de classe anterior)
│   └── 2.3 Recálculo na evolução
│         └── 2.3.1 Reclassificar no orders/paid quando o cliente cruza um limiar
│
├── 3. Enriquecimento de Order (entrega + faixa + flag)        [frente: edge webhook-receiver]
│   ├── 3.1 Derivação dos valores
│   │     ├── 3.1.1 Mapear delivery_method do payload → rótulo legível
│   │     └── 3.1.2 Derivar faixa de marmitas da contagem de itens (<7 avulso / múltiplos de 7)
│   ├── 3.2 Escrita no webhook-receiver (orders/paid)
│   │     ├── 3.2.1 Gravar metafields custom.metodo_entrega + custom.faixa_marmitas (metafieldsSet)
│   │     └── 3.2.2 Gravar tag operacional no pedido (orderUpdate / tagsAdd)
│   └── 3.3 Resiliência
│         └── 3.3.1 Fail-soft: erro de metafield/tag nunca quebra o processamento do webhook
│
└── 4. Backfill, QA & Encerramento                            [frente: operacional + docs]
    ├── 4.1 Pré-requisitos operacionais [MANUAL — herdados]
    │     ├── 4.1.1 [MANUAL] Rotacionar SHOPIFY_ADMIN_TOKEN + atualizar .env e Secrets
    │     └── 4.1.2 [MANUAL] Disparar register-shopify-webhooks + validar HMAC com pedido teste
    ├── 4.2 Backfill
    │     ├── 4.2.1 Script: reclassificar todos os customers existentes (metafield + tag)
    │     └── 4.2.2 Script: enriquecer pedidos existentes com metafield/tag (respeitando limite 60d da Admin API)
    ├── 4.3 QA & validação
    │     ├── 4.3.1 Cadastro/login teste → customer nasce com metafield + tag de classe corretos
    │     ├── 4.3.2 Pedido teste pago → order recebe metafields de entrega/faixa + tag operacional
    │     └── 4.3.3 Admin: confirmar metafields pinados visíveis + segmento por tag funcionando
    └── 4.4 Encerramento
          └── 4.4.1 Atualizar .claude/ (requirements R79+, fluxo-shopify-sync.md, state.md)
```

**Regra do 100%:** os work packages cobrem todo o escopo — hardening da fundação (Módulo 0), definições, escrita em customer, escrita em order, backfill, QA e documentação — sem lacuna nem duplicata. **O Módulo 0 foi adicionado após validação da saúde do sync (ver Seção 3.1) e é pré-requisito do Módulo 2.**

---

## 5. Roadmap de sprints

A fase entra na esteira existente do Jiló. Duas frentes de código (customer ‖ order) são **paralelizáveis** porque tocam arquivos distintos; as definições (Módulo 1) são pré-requisito de ambas.

| Sprint | Foco | Work packages | Entregável | Dependências |
|---|---|---|---|---|
| **S0 — Hardening** ★ | Saúde da fundação | 0.1.1, 0.1.2, 0.2.1, 0.3.1, 0.3.2 | Sync com caminho de update; telefone reconciliado; config alinhada; sync orgânico validado com cadastro real | Token Admin válido (4.1.1) |
| **S1 — Definições** | Fundação Shopify | 1.1.1, 1.2.1, 1.2.2, 1.3.1 | Metafield definitions criadas e pinadas no admin; vocabulário de tags documentado | Token Admin válido (4.1.1) |
| **S2a — Customer** | Classificação (paralela a S2b) | 2.1.1, 2.1.2, 2.2.1, 2.2.2, 2.3.1 | Cliente sincronizado nasce/atualiza com classificação (metafield + tag) | **S0**, S1 |
| **S2b — Order** | Entrega/faixa/flag (paralela a S2a) | 3.1.1, 3.1.2, 3.2.1, 3.2.2, 3.3.1 | Pedido pago recebe metafields de entrega/faixa + tag operacional | S1, webhooks ativos (4.1.2) |
| **S3 — Backfill & QA** | Retroativo + validação | 4.2.1, 4.2.2, 4.3.* | Base existente enriquecida; QA no admin aprovado | S0, S2a, S2b, 4.1.* |
| **🧹 Encerramento** | Docs + cleanup | 4.4.1 | `.claude/` atualizado; `codebase-cleanup` se houver órfão | S3 |

**Pré-requisitos operacionais [MANUAL] herdados — bloqueiam o roadmap:**
- **4.1.1 — Rotacionar `SHOPIFY_ADMIN_TOKEN`** (inválido/exposto). Bloqueia S1 (criar definitions) e S3 (backfill).
- **4.1.2 — Disparar `register-shopify-webhooks`** + validar HMAC. Bloqueia S2b e o QA de order (sem pedido entrando, nada a enriquecer).

> Sem cronograma fechado — o time encaixa cada sprint na cadência da esteira. A EAP entrega estrutura e dependências.

---

## 6. Schema / Definições

**Não há tabela nova no Supabase** — os dados de origem já existem (`orders.delivery_method`, contagem via `order_items`, `profiles`/`shopify_customer_id`). O que esta fase cria são **definições de metafield na Shopify** (via `metafieldDefinitionCreate`) e um **vocabulário fixo de tags**.

### Metafield definitions (Shopify Admin)

```
# Customer
namespace: custom
key:       classificacao
type:      single_line_text_field
ownerType: CUSTOMER
pinned:    true        # aparece no painel do cliente
# valores possíveis: "cliente-novo" | "recorrente" | "vip"

# Order
namespace: custom
key:       metodo_entrega
type:      single_line_text_field
ownerType: ORDER
pinned:    true
# valores: "Uber Direct" | "Frota própria Jiló" | "Lalamove"

namespace: custom
key:       faixa_marmitas
type:      single_line_text_field
ownerType: ORDER
pinned:    true
# valores: "avulso (<7)" | "kit 7" | "kit 14" | "kit 21" | "kit 28" | "kit 35+"
```

### Vocabulário fixo de tags

```
# Customer (classe — espelha o metafield; usada para SEGMENTO no admin)
classe:cliente-novo | classe:recorrente | classe:vip
  (apenas UMA por cliente — a anterior é removida no recálculo)

# Order (flag operacional — usada para FILTRO de lista de pedidos)
entrega:uber | entrega:frota-propria | entrega:lalamove
flag:fora-do-raio        (quando aplicável)
```

> **Restrição R65:** nenhum metafield/tag carrega PII. Classificação é derivada de contagem; entrega/faixa são atributos do pedido. CPF/contato jamais entram aqui.

---

## 7. Prompts de kickstart (para Antônio executar via feature-planner / Claude Code)

> Estes prompts são o ponto de partida. Como é iteração sobre projeto existente, o COMO definitivo de cada um deve passar pelo `feature-planner` (que lê o código antes de gerar). A EAP define O QUE e em QUE ORDEM.

### PROMPT 0 — Hardening do customer-sync (caminho de update + telefone + config) ★ NOVO
**Ferramenta:** Claude Code · **EAP ref:** 0.1.1, 0.1.2, 0.2.1 · **Duração:** 60–90 min

```
Contexto: Edge function supabase/functions/shopify-customer-sync/index.ts.
Auditoria ao vivo revelou: (a) early-return "already_synced" pula TODA atualização
para quem já tem shopify_customer_id — telefone/endereço/metafields nunca atualizam;
(b) 0/6 customers têm telefone na Shopify (só vai no create, que não roda mais);
(c) deploy está verify_jwt: false mas a doc diz true.

Tarefa:
1. Refatorar o fluxo para ter DOIS caminhos explícitos:
   - CRIAR: quando não há shopify_customer_id (comportamento atual).
   - ATUALIZAR: quando JÁ existe — rodar customerUpdate idempotente para reconciliar
     telefone (e, no futuro, metafields da Sprint 2). Não pode mais retornar cedo sem
     nada fazer.
2. Reconciliar telefone: se profile.phone existe e diverge do que está na Shopify,
   propagar via customerUpdate. Manter fail-soft.
3. Resolver a divergência verify_jwt: decidir o valor correto (há validação de JWT
   no corpo via auth.getUser — confirmar se o gatilho do frontend manda o header),
   aplicar no deploy e atualizar .claude/fluxo-shopify-sync.md para refletir a verdade.

IMPORTANTE:
- Idempotência passa a ser por DADO, não só por presença de ID.
- Fail-soft preservado (R66): erro de update não quebra o login/sync.
- Nenhum log de PII (R65).
- NÃO embutir ainda os metafields da classificação — só preparar o caminho de update
  onde a Sprint 2 (PROMPT 2) vai pendurar o metafieldsSet.

Critério de sucesso: um profile existente que ganha telefone passa a refletir o phone
na Shopify após novo SIGNED_IN; verify_jwt real == documentado.
```

### PROMPT 0b — Validação do sync orgânico (teste real ponta-a-ponta) ★ NOVO
**Ferramenta:** Operacional (cadastro real) + Claude Code (verificação) · **EAP ref:** 0.3.1, 0.3.2 · **Duração:** 20–30 min

```
Contexto: Os 6 customers atuais foram TODOS criados por backfill manual (26/06). O
gatilho orgânico (signup → SIGNED_IN → sync) nunca foi exercitado em produção.

Tarefa:
1. Fazer um cadastro REAL em produção (jilomarmitas.com) com nome + telefone + endereço.
2. Confirmar que o sync orgânico disparou e completou: customer na Shopify com nome,
   telefone, endereço nativo e tags — sem ser backfill.
3. Verificar nos logs da edge (ou no estado persistido) que o caminho foi "synced"
   (criação real), não "already_synced".

Critério de sucesso: um cadastro de verdade nasce 100% completo na Shopify pelo
gatilho automático — prova que a fundação funciona sem intervenção manual.
```

### PROMPT 1 — Definições de metafield + vocabulário de tags
**Ferramenta:** Claude Code (MCP Shopify) · **EAP ref:** 1.1.1, 1.2.1, 1.2.2, 1.3.1 · **Duração:** 30–45 min

```
Contexto: Loja Shopify jnutg9-u2.myshopify.com (Jiló), Admin GraphQL 2025-10.
Token Admin já rotacionado e válido. Objetivo: criar as definições de metafield
operacionais e documentar o vocabulário de tags.

Tarefa:
1. Criar 3 metafield definitions via metafieldDefinitionCreate:
   - CUSTOMER custom.classificacao (single_line_text_field, pin: true)
   - ORDER custom.metodo_entrega (single_line_text_field, pin: true)
   - ORDER custom.faixa_marmitas (single_line_text_field, pin: true)
2. Validar cada mutation com Shopify:validate_graphql_codeblocks (api: "admin") ANTES de executar.
3. Confirmar via query que as 3 definitions existem e estão pinadas.

IMPORTANTE:
- NÃO criar metafield de CPF/PII (proibido por R65).
- Usar namespace "custom" (merchant-owned), não app-reserved.
- Vocabulário de tags é documentação — registrar em .claude/, não criar tag agora.

Critério de sucesso: as 3 definitions aparecem em metafieldDefinitions e ficam
visíveis (pinned) na página de cliente/pedido do admin.
```

### PROMPT 2 — Classificação de cliente no customer-sync
**Ferramenta:** Claude Code · **EAP ref:** 2.1.1, 2.1.2, 2.2.1, 2.2.2 · **Duração:** 60–90 min

```
Contexto: Edge function supabase/functions/shopify-customer-sync/index.ts (Deno,
verify_jwt: true). Hoje cria/atualiza customer com campos nativos + endereço (R64–R66),
tags ["jilo-customer","source:supabase"]. Usa getShopifyAdminToken() de _shared.

Tarefa:
1. Função pura classifyCustomer(orderCount, hasKit28):
   - 0–1 pedidos → "cliente-novo"
   - 2+ → "recorrente"
   - 5+ pedidos OU hasKit28 → "vip"
2. Buscar contagem de pedidos do cliente via service_role (tabela orders por shopify_customer_id
   ou customer_email) e detectar kit 28 (linha com 28 itens não-frete).
3. Após o customerCreate/upsert existente, gravar metafield custom.classificacao via metafieldsSet.
4. Espelhar como tag classe:<valor>, REMOVENDO a tag de classe anterior (tagsRemove) antes de
   adicionar a nova (tagsAdd) — apenas UMA classe por cliente.

IMPORTANTE:
- FAIL-SOFT: erro de metafield/tag NÃO pode bloquear o sync do customer (padrão R66).
- Nenhum log de PII (padrão R65).
- Não tocar no fluxo de endereço nem nos gatilhos (R64) — só ADICIONAR a classificação.
- Validar mutations antes de executar.

Critério de sucesso: cadastro/login de teste → customer no admin com metafield
custom.classificacao preenchido e tag classe:* correta (sem duplicar classes).
```

### PROMPT 3 — Enriquecimento de order no webhook-receiver
**Ferramenta:** Claude Code · **EAP ref:** 3.1.1, 3.1.2, 3.2.1, 3.2.2, 3.3.1 · **Duração:** 60–90 min

```
Contexto: Edge function supabase/functions/shopify-webhook-receiver/index.ts.
No orders/paid já popula delivery_method, shipping_fee_cents, delivery_status (R68, Sprint 4.1),
lendo note_attributes do payload. Idempotência por webhook_events.

Tarefa (SOMENTE no handler orders/paid):
1. Mapear delivery_method → rótulo legível: uber_direct→"Uber Direct",
   jilo_own→"Frota própria Jiló", lalamove→"Lalamove".
2. Derivar faixa de marmitas da contagem de itens não-frete: <7→"avulso (<7)";
   múltiplos de 7 → "kit 7/14/21/28/35+".
3. Gravar metafields ORDER custom.metodo_entrega e custom.faixa_marmitas via metafieldsSet.
4. Gravar tag operacional no pedido (entrega:* e flag:fora-do-raio se aplicável) via tagsAdd/orderUpdate.
5. (Opcional) Disparar reclassificação do cliente quando ele cruza um limiar (EAP 2.3.1).

IMPORTANTE:
- FAIL-SOFT (R68): erro de metafield/tag NUNCA quebra o processamento do webhook.
- Excluir a variant fantasma de frete (__internal_shipping, R39) da contagem de faixa.
- NÃO escrever no orders/create (dados de entrega só consolidam no paid — D4).
- Validar mutations antes de executar.

Critério de sucesso: pedido de teste PAGO → no admin, a página do pedido mostra
custom.metodo_entrega + custom.faixa_marmitas e a tag entrega:* correta.
```

### PROMPT 4 — Backfill (customers + orders)
**Ferramenta:** Claude Code · **EAP ref:** 4.2.1, 4.2.2 · **Duração:** 45–60 min

```
Contexto: Token Admin rotacionado e válido. Webhooks já ativos. Definitions criadas (PROMPT 1).
Edges estendidas (PROMPTS 2–3).

Tarefa:
1. Script de backfill de customers: para cada profile com shopify_customer_id, recalcular
   a classificação e gravar metafield + tag (reusar a lógica do PROMPT 2).
2. Script de backfill de orders: para pedidos existentes, gravar metafields de entrega/faixa
   + tag. ATENÇÃO ao limite de 60 dias da Admin API — para pedidos mais antigos, solicitar
   acesso a "all orders" ou limitar o backfill à janela disponível e registrar.

IMPORTANTE:
- Idempotente: rodar 2x não duplica tag nem corrompe metafield.
- FAIL-SOFT por item: um erro não aborta o lote.
- Sem PII em log.

Critério de sucesso: customers e pedidos existentes aparecem no admin com a
classificação/metafields corretos; o lote loga contadores (ok/erro) sem PII.
```

### PROMPT 5 — QA + atualização da memória do projeto
**Ferramenta:** Claude Code · **EAP ref:** 4.3.*, 4.4.1 · **Duração:** 30–45 min

```
Tarefa:
1. QA (em produção): cadastro teste → metafield+tag de classe; pedido teste pago →
   metafields de entrega/faixa + tag; admin → metafields pinados visíveis e
   segmento de cliente por tag funcionando.
2. Atualizar .claude/: novas regras em requirements.md (R79+: metafields operacionais,
   vocabulário de tags, fail-soft, recálculo de classe), estender fluxo-shopify-sync.md,
   registrar a sessão em state.md.
3. Rodar codebase-cleanup se sobrar código órfão.

Critério de sucesso: QA aprovado no admin; docs .claude/ refletem o estado real.
```

---

## 8. Regras de negócio (para alimentar requirements.md — R79+)

1. **Classificação de cliente** por contagem de pedidos: `cliente-novo` (0–1), `recorrente` (2+), `vip` (5+ pedidos OU 1+ kit de 28). Calculada no sync e recalculada no `orders/paid` ao cruzar limiar.
2. **Gravação dupla da classe:** metafield `custom.classificacao` (exibição) + tag `classe:<valor>` (segmento). Apenas UMA classe por cliente — a anterior é removida antes de adicionar a nova.
3. **Order metafields** (`custom.metodo_entrega`, `custom.faixa_marmitas`) gravados **só no `orders/paid`** (dados de entrega consolidados — D4/R68).
4. **Flag operacional** é **tag** de pedido (`entrega:*`, `flag:fora-do-raio`) — para filtro de lista; não metafield.
5. **PII proibida em metafield/tag** (R65/LGPD) — CPF, e-mail, telefone, nome jamais. Sem log de PII.
6. **Fail-soft** em toda escrita de metafield/tag: erro nunca bloqueia o sync do customer nem o processamento do webhook (R66/R68).
7. **Idempotência por DADO, não por presença de ID** (achado do Módulo 0): o sync precisa ter caminho de *atualização* — não basta retornar `already_synced` quando o `shopify_customer_id` existe, senão telefone/endereço/metafields nunca atualizam para a base existente. Backfill e recálculo rodam múltiplas vezes sem duplicar tag nem corromper metafield.
8. **Variant fantasma de frete** (`__internal_shipping`, R39) excluída da contagem de faixa de marmitas.
9. **`verify_jwt` deve refletir a realidade do deploy** (achado do Módulo 0): config real e documentação não podem divergir.

---

## 9. Riscos identificados & mitigação

| # | Risco | Mitigação |
|---|-------|-----------|
| 1 | **Sync sem caminho de update** → metafield novo nasce morto para os 6 customers existentes (early-return pula tudo) | **Módulo 0 (0.1.1)** — separar criar/atualizar ANTES de pendurar metafield (PROMPT 0) |
| 2 | **Sync orgânico nunca validado** → 6/6 são backfill manual; gatilho automático pode falhar em produção sem ninguém ver | **0.3.1** — teste de cadastro real ponta-a-ponta (PROMPT 0b) |
| 3 | **Telefone 0/6** → escrita de phone nunca comprovada; mesmo padrão fail-soft pode mascarar falha de metafield | **0.1.2** — reconciliar telefone no caminho de update; validar que fail-soft loga o suficiente |
| 4 | **Webhooks nunca disparados** → sem pedido entrando, order não é enriquecido | 4.1.2 — disparar `register-shopify-webhooks` + validar HMAC com pedido teste ANTES de S2b/QA |
| 5 | **`SHOPIFY_ADMIN_TOKEN` inválido (401) e exposto** → backfill e definitions falham; risco de segurança | 4.1.1 — rotacionar o token (e `SHOPIFY_CLIENT_SECRET`/`UBER_CLIENT_SECRET` flagrados) antes de S0/S1/S3 |
| 6 | **Limite de 60 dias da Admin API no backfill de pedidos** | 4.2.2 — solicitar acesso a `all orders` OU limitar à janela disponível e registrar a limitação |

**Riscos secundários:** divergência `verify_jwt` (deploy false × doc true) — resolvida em 0.2.1; divergência de loja canônica (`jnutg9-u2` vs `jilo-marmitas`) nos scripts — confirmar ao rotacionar o token; conflito de escrita no `customer-sync`/`webhook-receiver` — mitigado por fail-soft e por tocar só pontos aditivos.

---

## 10. Próximos Passos — Ciclo de Vida do Projeto

### Sequência de execução pós-planejamento
1. ⬜ **[MANUAL]** Rotacionar `SHOPIFY_ADMIN_TOKEN` + disparar `register-shopify-webhooks` (pré-requisitos 4.1.*)
2. ⬜ **Executar PROMPT 0 + 0b (Sprint 0 — hardening da fundação)** — corrigir caminho de update, reconciliar telefone, alinhar config, validar sync orgânico com cadastro real
3. ⬜ Executar PROMPT 1 (definições) → validar no admin
4. ⬜ Executar PROMPTS 2 e 3 em paralelo (customer ‖ order) via `feature-planner`
5. ⬜ Executar PROMPT 4 (backfill) após token válido e webhooks ativos
6. ⬜ Executar PROMPT 5 (QA + docs) e rodar `codebase-cleanup` se houver órfão
7. ⬜ Para evoluções seguintes, usar `feature-planner` (lê a pasta `.claude/`)

### Visão do ciclo completo
1. ✅ Discovery — não aplicável (iteração sobre produto existente)
2. ✅ Planejamento (este documento)
3. ⬜ Construção (PROMPTS 1–4 via feature-planner / Claude Code)
4. ⬜ Limpeza (`codebase-cleanup`)
5. ⬜ Documentação (atualização do `.claude/` — 4.4.1)
6. ⬜ Iteração (`feature-planner` para a fase seguinte: dashboards/relatórios — fora deste escopo)

---

*Jiló • DaJu Alimentação • EAP Enriquecimento de Metafields Operacionais • Fainow — Laboratório de Soluções • Junho 2026*