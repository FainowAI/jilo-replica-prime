---
name: feature-builder
description: "Planeja E EXECUTA atualizações de código/banco dentro do Codex: lê o repositório local e o banco com ferramentas nativas (Read/Grep/Glob + o MCP de banco do projeto) e aplica as mudanças direto (Edit/Write/execute_sql) — SEM gerar prompts para rerodar. É a contraparte de EXECUÇÃO do feature-planner (que fica no Codex.ai só gerando prompts): use feature-builder quando o objetivo é CONSTRUIR a feature aqui, não descrevê-la. Ative SEMPRE que o usuário pedir para executar/implementar uma EAP (ex: \"executa a EAP do admin\", \"constrói o Sprint 0\", \"aplica o plano\"), implementar feature, criar aba, adicionar campo, corrigir bug, alterar cálculo/regra/permissão, rodar migration, ou disser \"roda o feature-builder\", \"implementa isso\", \"constrói essa atualização\". Aceita tanto um documento EAP .md (criado no Codex.ai) quanto um pedido avulso. NUNCA supõe regra de negócio: dispara gate bloqueante antes de executar. Planeja → pede aprovação → executa pelo método ponytail (solução mais simples que funciona: menor diff, reuso, YAGNI), orquestrando sub-agentes especializados quando vale a pena: code-explorer (mapear código), data-architect (estrutura de dados/schema), feature-coder (codar tracks em paralelo) e security-auditor (RLS/RBAC/PII/segurança). NÃO use para perguntas conceituais, projetos novos do zero (eap-project-planner), nem para apenas GERAR prompts sem executar (feature-planner, no Codex.ai)."
---


# Feature Builder

Planeja e **executa** atualizações em projetos existentes, dentro do Codex, lendo o código e o banco **uma vez** com ferramentas nativas e aplicando as mudanças direto — sem o round-trip de "gerar prompts e rerodar".

## Por que esta skill existe

O fluxo antigo desperdiçava tokens duas vezes: o `feature-planner` rodava no Codex.ai via MCP (GitHub + Supabase), lia todo o código/banco para o contexto, e **gerava prompts**; depois o usuário colava esses prompts no Codex, que **relia tudo de novo** para executar. Leitura dobrada, contexto dobrado.

O `feature-builder` colapsa as duas metades numa só sessão do Codex:
- **Lê com ferramentas nativas** (`Read`/`Grep`/`Glob`) — o repositório está em disco, então não há custo de MCP do GitHub. Lê uma vez, reaproveita o contexto na execução.
- **Executa direto** (`Edit`/`Write`/`execute_sql`) — o plano vira código aplicado, não um documento de prompts para rerodar.
- **Banco pelo MCP de banco conectado no projeto** (ex.: um servidor Supabase/Postgres) — `list_tables`/`execute_sql` para schema e dados reais. Não assuma um nome fixo de servidor; descubra-o pelas ferramentas disponíveis.

A regra de ouro continua a mesma do `feature-planner`: **ler antes de escrever**. Gerar mudança "no escuro" é a principal causa de regressão. O que muda é que, depois de ler e planejar, esta skill **constrói**.

## Quando usar vs. quando não usar

| Situação | Skill correta |
|----------|---------------|
| Tenho uma EAP pronta e quero **construir** aqui no Codex | **feature-builder** (esta) |
| Quero implementar feature / bugfix / migration **executando** | **feature-builder** (esta) |
| Quero só **gerar prompts** no Codex.ai (sem executar) | `feature-planner` (no Codex.ai) |
| Quero **criar a EAP** de um módulo novo do zero | `eap-project-planner` (no Codex.ai) |
| Pergunta conceitual, sem mudança de código | nenhuma skill |

## Princípios inegociáveis

1. **Nunca supõe regra de negócio.** Se a feature muda lógica (cálculo, condicional, fluxo de aprovação, RBAC, validação, exceção), a skill **para no gate** (Fase 0.B) e valida com o usuário antes de executar. Detalhe completo em `references/business-rules-gate.md`.
2. **Planeja → aprovo → executa.** Nenhuma escrita (arquivo, migration, mutation) acontece antes do usuário aprovar o plano (Fase 4). Leitura é livre; escrita exige OK.
3. **Otimiza tokens por construção.** Lê uma vez com ferramentas nativas, reaproveita contexto, e só dispara sub-agentes quando o ganho é real (área grande a explorar, estrutura de dados não-trivial, segurança a auditar, ou tracks de código independentes e substanciais) — porque cada sub-agente relê contexto e custa tokens. Critérios de quando despachar cada agente → `references/subagent-orchestration.md`.
4. **Não quebra o que já funciona.** Reusa antes de criar; respeita constraints do banco; valida valores hardcoded contra o schema.
5. **Respeita o Git Flow do projeto.** Tipicamente `feature/*` → `develop` → `staging` → `main` (confirme o fluxo real na doc do projeto). **Nunca** commita direto em `main`/`staging`. Só commita/pусha quando o usuário pedir.
6. **Constrói pelo método ponytail.** Todo código sai pela solução mais simples que funciona (menor diff, reuso, YAGNI). É o método padrão — ver seção abaixo.

## Método de desenvolvimento: ponytail (full, sempre on)

Todo código que esta skill escreve segue o **ponytail** (`/ponytail:ponytail`) — a disciplina do dev sênior preguiçoso: a solução mais simples que funciona, menor diff, **reuso antes de criar**, stdlib/nativo antes de dependência, uma linha antes de cinquenta, YAGNI. É o **método padrão de todo build** (nível `full`); o usuário pode trocar (`/ponytail lite|ultra`) ou desligar (`stop ponytail`) por execução.

**Ative de fato:** ao entrar na Fase 3, invoque a skill `ponytail` (nível `full`) para carregar a ladder completa — ela fica ativa até o fim do build (planejamento + execução + briefs de subagent).

Como se manifesta dentro do workflow:
- **Fase 3 (plano):** antes de listar cada unidade de trabalho, suba a ladder — *esta unidade precisa existir? já há algo no repo que resolve? dá pra reusar/estender em vez de criar?* O plano ataca o **mínimo que entrega a feature** (alinhado à reconciliação 2.6, que já manda só atacar PARCIAL + FALTA).
- **Fase 5 (execução):** o **menor diff que funciona**; `Edit` cirúrgico, nunca recriar o arquivo; marque simplificações deliberadas com comentário `ponytail:` (nomeando o teto e o upgrade path, ex.: `// ponytail: lock global, por-conta se throughput pesar`); deixe **UM check runnable** para lógica não-trivial (branch/loop/parser/dinheiro/segurança).
- **`feature-coder`:** todo brief de track instrui o subagent a seguir ponytail (ver `references/parallel-execution.md`).

**Os guardrails do ponytail batem com os desta skill — não há conflito.** ponytail **nunca** simplifica: validação em trust boundary, error handling que evita perda de dado, segurança, acessibilidade, ou o que foi explicitamente pedido — e **nunca** é preguiçoso sobre *entender* o problema (a ladder encurta a solução, não a leitura). Isso é exatamente o "ler antes de escrever" e o gate de regras de negócio (Fase 0.B). Onde a regra de negócio validada exige a versão completa, ela **vence** a laziness — sem re-discutir.

## Sub-agentes especializados

Esta skill orquestra quatro agentes nomeados (em `.Codex/agents/`) para otimizar a entrega. Despache **só quando vale** — sub-agente relê contexto e custa tokens; na dúvida, faça você mesmo na sessão.

| Agente | Ajuda a… | Fase | Despache quando |
|--------|----------|------|------------------|
| `code-explorer` | entender o código | 1 | a área é grande/desconhecida ou tem 2+ subsistemas; senão leia inline |
| `data-architect` | definir estrutura de dados | 2–3 | há schema novo/alterado não-trivial ou DDL de EAP a reconciliar; senão pule |
| `feature-coder` | codar | 5 | há 2+ tracks independentes (cada uma 2+ unidades, total ≥5, arquivos disjuntos); senão sequencial |
| `security-auditor` | segurança | pré-4 e 5.5 | a feature toca acesso/auth/PII/lógica de valor; senão declare "sem superfície de segurança" |

Os três agentes de análise (`code-explorer`, `data-architect`, `security-auditor`) **não escrevem** — entregam mapa/blueprint/achados, e a sessão principal decide e aplica (mantendo o gate de aprovação na sua mão). O `feature-coder` escreve só dentro do escopo fechado da sua track. Como dar o brief e o que fazer com cada retorno → **`references/subagent-orchestration.md`**.

## Inputs

A skill aceita **dois modos de entrada**:

- **Modo EAP:** um documento `.Codex/EAP_*.md` (ou caminho fornecido) criado no Codex.ai. Já contém decisões travadas, schema, riscos e WPs — a skill **valida e executa**, não re-planeja do zero. ⚠️ A EAP descreve o **alvo pretendido**, não o estado atual: pode estar desatualizada (parte já construída, DDL divergente do banco real). O **repositório e o banco são a fonte de verdade** — sempre reconcilie (Fase 2.6) antes de planejar, ou você re-cria/sobrescreve trabalho que já existe.
- **Modo avulso:** uma descrição direta ("adiciona um campo X", "corrige o bug Y", "cria a aba Z"). A skill planeja do zero seguindo todas as fases.

Se o usuário não indicar qual EAP ou o que executar, pergunte antes de iniciar. Se o contexto da conversa deixa claro, confirme em uma linha e prossiga.

---

## Workflow (7 fases)

Execute em sequência. As Fases 0–3 são **só leitura e planejamento** (seguras, sem efeito colateral). A Fase 4 é a **aprovação**. As Fases 5–6 **executam**.

### FASE 0 — Ingestão + leitura `.Codex/` + Gate de regras

**0.A — Carregar a memória do projeto (ferramentas nativas, não MCP):**

1. **Detecte o modo de entrada.** Se for um EAP, leia o `.md` inteiro com `Read` — extraia decisões travadas, schema novo, riscos, WPs e sprints. O EAP encurta muito as fases seguintes (já mapeou banco e arquitetura).
2. **Leia a pasta `.Codex/`** com `Read`/`Glob`, em ordem de prioridade:
   - `state.md` — **primeiro**, mas só o **topo** (1–2 sessões mais recentes). É um log cumulativo que cresce muito; ler o arquivo inteiro estoura o contexto (ironia para uma skill que otimiza tokens). Se precisar de algo específico do histórico, use `Grep`/offset — nunca o arquivo todo.
   - `requirements.md` — regras de negócio (a "lei"). A feature DEVE respeitá-las.
   - `roadmap.md` — onde a feature se encaixa.
   - `project.md` — visão e decisões arquiteturais.
   - `fluxo-*.md` relevantes — descrevem como o fluxo já funciona; **isso substitui parte da leitura arquivo-por-arquivo da Fase 1**. Anote quais precisarão ser atualizados na Fase 6.
3. Se `.Codex/` não existir ou faltar o fluxo relevante, registre `DOCS_MISSING` e inclua a criação na Fase 6.

**0.B — Gate bloqueante de regras de negócio:**

Se a feature envolve **qualquer** mudança de lógica, **pare e valide** antes de executar. No **Modo EAP**, muitas decisões já vêm travadas ("Decisões da Fase 0", riscos) — então **confirme as regras já documentadas** em vez de re-perguntar, e só abra perguntas para o que o EAP **não** cobre. No **Modo avulso**, rode o gate completo.

Detecção, as 4 dimensões obrigatórias (regra exata, RBAC, erros/exceções, dados legados), formato de recomendação e validação Confirmar/Ajustar/Rejeitar → **leia `references/business-rules-gate.md`**. As respostas validadas alimentam o plano e a execução.

> Exceção única ao gate: bugfix cirúrgico de UMA linha em UM arquivo sem mudar comportamento (typo, cor, import).

### FASE 1 — Leitura do código (nativo)

Mapeie arquitetura e convenções **antes** de propor mudança. Use `Glob` para estrutura e `Grep` para padrões — **não** use `github:get_file_contents`; o repo é local.

1. `Glob` na raiz e em `src/` (ou `apps/*`, `packages/*` em monorepo) para entender o layout. ⚠️ Em sub-apps com `node_modules`/`.next`/`dist`/`vendor` no disco, um glob amplo (`apps/x/**`) é **engolido e truncado** por eles — escondendo arquivos reais de `src/` e te fazendo "planejar criar" o que já existe. Liste a fonte excluindo-os (ex.: `find <app>/src -type f -not -path "*/node_modules/*"`) e, antes de criar qualquer arquivo, **confirme que ele não existe** (o guard "read-before-write" do editor é a última rede — não dependa só dele).
2. `Read` nos arquivos diretamente relacionados à feature. Se é "nova aba", leia uma aba existente para copiar o padrão.
3. Leia a infra que a feature vai tocar: registro de rotas, navegação, types globais derivados do banco/ORM, auth/permissões.
4. Mapeie mentalmente: stack, routing, state/data-fetching, UI lib, tipagem, notificações, RBAC, forms. Esses padrões definem **como** você vai escrever o código na Fase 5.

**Quando despachar `code-explorer` (opcional):** se a área é grande, desconhecida, ou envolve 2+ subsistemas, despache **2–3 `code-explorer` em paralelo** (mesmo turno), cada um numa faceta (feature similar, arquitetura, camada de dados/UX). Cada um devolve os arquivos essenciais — **leia você mesmo esses arquivos** depois, para ter o contexto detalhado de planejamento. Se a área é pequena/familiar ou a `.Codex/fluxo-*.md` já cobre, **leia inline** (explorer só duplicaria leitura). Detalhe → `references/subagent-orchestration.md`.

No Modo EAP, foque nos pontos de alteração que o EAP aponta — não releia o que ele já mapeou.

### FASE 2 — Leitura do banco (MCP de banco do projeto)

1. Use `list_tables` (no MCP de banco conectado — ex.: Supabase/Postgres; descubra o nome pelas ferramentas) quando precisar do **panorama** do schema. Mas quando você **já sabe o que procura** — existência de 1 tabela/coluna/índice — prefira um `execute_sql` direcionado (1 query a `information_schema`/`pg_indexes`): é muito mais barato que despejar dezenas de tabelas no contexto.
2. `execute_sql` para investigar dados/estado reais: valores de ENUM/CHECK, conteúdo de tabelas de config, políticas de acesso (RLS), índices existentes.
3. Classifique cada tabela relevante: **USAR** (só lê) / **ALTERAR** / **CRIAR** / **política de acesso**.
4. **Cheque conflitos** (custo 10x se descoberto depois): NOT NULL sem default, CHECK vs. valores hardcoded, UNIQUE, FK ON DELETE, ENUM banco vs. string código, RLS ativa sem policy. Reporte na hora se achar.

**Quando despachar `data-architect`:** se a feature tem **estrutura de dados não-trivial** (tabelas/colunas novas, constraints, índices, políticas de acesso) ou há DDL de EAP a reconciliar, despache **1 `data-architect`** — ele inspeciona o banco real, reconcilia a DDL e devolve o blueprint de schema + tipos + policies. A sessão principal é quem aplica a migration (o agente nunca aplica). Se a feature **não muda estrutura de dados** (pura UI/lógica de cliente), **pule** — não há dado novo para desenhar. Detalhe → `references/subagent-orchestration.md`.

> ⚠️ **Convenção de migração varia por projeto.** Confirme na `.Codex/fluxo-infraestrutura.md` / no EAP como o projeto aplica DDL: via `apply_migration`, ou via `execute_sql` + commit do `.sql`, e se há um ORM (Drizzle/Prisma) cujo schema precisa ser espelhado. Em alguns setups `apply_migration` tem gotchas — verifique antes de migrar.

### FASE 2.5 — Análise de impacto (obrigatória se a feature toca código compartilhado)

Antes de planejar a escrita, mapeie efeitos colaterais com `Grep`:
- Quem importa/usa a função, hook, type ou tabela que vai mudar? Liste **todos** os dependentes.
- No banco: views/functions/triggers/policies/FKs que referenciam tabelas alteradas.
- Em integrações: edge functions, webhooks, workflows externos.

Classifique cada dependente (ALTO/MÉDIO/NENHUM) e o ajuste necessário. Se o impacto for grave, **reporte e peça decisão** antes de seguir. Exceção: bugfix cirúrgico.

### FASE 2.6 — Reconciliação EAP × realidade (Modo EAP — obrigatória)

A EAP descreve o **alvo**; o repo e o banco dizem o que **já existe**. Pular esta etapa é o erro mais caro da skill: você re-cria arquivos que já funcionam, sobrescreve código bom, ou re-roda DDL desatualizado. (Caso real: uma EAP marcada `[PLANEJADO]` cujo sub-app já estava ~70% construído — scaffold, tabela de auditoria e camada de dados prontos — e o `state.md` não registrava nada disso.)

Para cada unidade da EAP (WP, arquivo, tabela, índice, Server Action), classifique contra o que você leu nas Fases 1–2:

| Status | Significado | Ação no plano |
|--------|-------------|---------------|
| ✅ **FEITO** | já existe e atende | **não tocar** |
| 🟡 **PARCIAL** | existe mas incompleto/divergente | completar/ajustar só o delta |
| 🔴 **FALTA** | não existe | criar |

Regras:
- **DDL da EAP é suspeito até prova.** Se a EAP traz `CREATE TABLE`/colunas, valide contra o schema real (`execute_sql`) — nomes/tipos podem ter divergido (ex.: EAP diz `"actorId"`, o banco tem `actor_id`). O banco vence; se o ORM/types já espelham o real, **não mexa**. (Esta reconciliação é exatamente o que o `data-architect` entrega, se você o despachou na Fase 2.)
- Apresente a tabela de reconciliação no plano (Fase 4) — é o que prova ao usuário que você não vai refazer o que já está pronto.
- O plano (Fase 3) ataca **apenas** PARCIAL + FALTA.

No Modo avulso (sem EAP) esta fase é leve: reconcilie o pedido contra o que já existe para evitar duplicação.

### FASE 3 — Plano de execução

Monte o plano que será aprovado e executado. Aqui acontece a **análise de dependências** que decide o paralelismo:

1. **Liste as unidades de trabalho** (cada arquivo a criar/editar, cada migration, cada Server Action) em ordem técnica natural: migrations → types → config/rotas → hooks de dados → componentes (bottom-up) → páginas → integração → edge functions. **Antes de incluir cada unidade, suba a ladder do ponytail** (precisa existir? já há algo no repo que resolve? dá pra reusar/estender?) — o plano lista só o mínimo que entrega a feature.
2. **Construa o grafo de dependências** e **agrupe em tracks**. Database é sempre a track inicial bloqueante; docs é sempre a track terminal. Regras de agrupamento, threshold de paralelismo e quando vale `feature-coder` → **leia `references/parallel-execution.md`**.
3. **Decida o modo de execução:**
   - **Sequencial (na sessão principal):** padrão. Reaproveita o contexto já lido — mais barato em tokens. Use quando não há 2+ tracks independentes e substanciais.
   - **Paralelo (`feature-coder`):** quando há **2+ tracks independentes, cada uma com 2+ unidades, total ≥ 5 unidades**, e os arquivos das tracks são **disjuntos** (sem sobreposição). Database roda primeiro; depois despache 1 `feature-coder` por track independente em paralelo.
4. **Crie a lista de tarefas** (`TaskCreate`/TodoList) refletindo as tracks e a ordem — ela guia a execução e dá visibilidade ao usuário.

### FASE 3.5 — Auditoria de segurança (condicional, antes da aprovação)

Se a feature toca **controle de acesso, auth, PII/dado sensível, ou lógica de valor** (preço/desconto/limite/permissão), despache **1 `security-auditor`** sobre o plano + o código/schema relevante **antes** de pedir aprovação. Pegar uma brecha aqui é muito mais barato que depois de aplicar. Os achados **CRÍTICO/ALTO entram no plano da Fase 4 como bloqueantes** — só prossegue com mitigação. Se a feature **não tem superfície de segurança** (ajuste visual, copy, refactor interno), **declare isso explicitamente** e pule — auditar aqui é ruído. Detalhe → `references/subagent-orchestration.md`.

### FASE 4 — Aprovação (gate de execução)

**Nenhuma escrita antes daqui.** Apresente o plano de forma enxuta:
- Resumo (1–2 frases do que será construído)
- Regras de negócio validadas no gate (se ativou)
- Estrutura de dados (blueprint do `data-architect`, se despachado): tabelas/colunas/policies a criar/alterar
- Achados de segurança (do `security-auditor`, se despachado): CRÍTICO/ALTO + mitigação
- Análise de impacto (resumo)
- Tracks + modo de execução (sequencial ou `feature-coder` em paralelo) + ordem
- Arquivos a criar/editar, tabelas a migrar
- Riscos e mitigações

Se você estiver em **plan mode**, use `ExitPlanMode` para apresentar e obter aprovação. Caso contrário, apresente inline e **espere um "aprovado" explícito**. Respostas vagas não liberam a execução — confirme.

### FASE 5 — Execução

Construa, na ordem do plano, **pelo método ponytail**: menor diff que funciona, `Edit` cirúrgico (nunca recriar o arquivo), reuso antes de criar, comentário `ponytail:` nas simplificações deliberadas, e UM check runnable para lógica não-trivial. Detalhe completo (despacho de `feature-coder`, brief autocontido por track, checagem de disjunção de arquivos, verificação) → **leia `references/parallel-execution.md`**. Em resumo:

1. **Track database primeiro, sempre sequencial.** Aplique a DDL pela convenção do projeto (confirmada na Fase 2) — usando o blueprint do `data-architect` se você o despachou. Commit do `.sql` e espelhe no ORM/types se o projeto usa um. Confirme com `list_tables` que o schema bateu.
2. **Tracks pós-database:**
   - **Modo sequencial:** execute você mesmo, na sessão, com `Edit`/`Write` — reusa o contexto já carregado (mais barato).
   - **Modo paralelo:** despache 1 `feature-coder` por track independente, **todas no mesmo turno** para rodarem juntas (se o agente nomeado não estiver registrado, caia para `general-purpose` colando a persona dele). Cada brief é autocontido: arquivos-alvo, padrões a seguir (com paths reais), regras de negócio aplicáveis e a lista do que NÃO tocar. Garanta que as tracks são file-disjuntas antes de paralelizar.
3. **Integração** na sessão principal depois que as tracks terminam: navegação, permissões, fios soltos entre o que tracks diferentes produziram.
4. **Efeitos institucionais do projeto:** se o projeto exige um padrão transversal (ex.: toda mutation passa por uma função de auditoria, um gate de aprovação específico), respeite — está nas regras do projeto/EAP (`requirements.md`/`fluxo-*.md`).

### FASE 5.5 — Verificação (antes de declarar pronto)

Não diga "pronto" sem evidência. Rode o que o projeto tiver e **mostre a saída real**:
- Typecheck / build / lint (ex: `npm run build`, `tsc --noEmit`, `npm run lint` no workspace afetado — descubra os comandos na doc/no manifesto)
- Se houver testes, rode os relevantes
- Confirme migrations aplicadas via `list_tables`/`execute_sql`
- **Re-auditoria de segurança:** se você despachou `security-auditor` na Fase 3.5 (ou a feature tocou acesso/PII/lógica de valor), despache-o de novo **sobre o código aplicado** para confirmar que nada vazou na implementação. Achados CRÍTICO/ALTO bloqueiam o "pronto".

Se algo falhar, conserte antes de seguir — ou reporte com a saída se for bloqueio externo. Veja a skill `verification-before-completion` se precisar de disciplina extra.

### FASE 6 — Sincronizar `.Codex/` (sempre)

Última etapa, **obrigatória**. Atualize a memória do projeto para a próxima sessão. Template e detalhe → **leia `references/doc-sync.md`**. Em resumo:
- `fluxo-*.md` relevante — criar ou atualizar (se o EAP marcava `[PLANEJADO]`, troque por real).
- `requirements.md` — adicionar regras novas validadas no gate (nunca remover existentes).
- `roadmap.md` — mover a feature de "Próximo" para "Concluído"; registrar backlog que surgiu.
- `state.md` — o que foi feito nesta sessão, pendências, notas para a próxima.

Depois, sugira o commit seguindo o Git Flow do projeto (nunca em `main`/`staging`) — mas **só commite se o usuário pedir**.

---

## Regras gerais

- **Reuso antes de criar.** Expanda hooks/componentes existentes; use o design system do projeto; prefira composição a duplicação.
- **Nomes seguem o projeto.** camelCase se o projeto usa camelCase; respeite naming misto (ex: tabelas snake_case × colunas `"camelCase"` quotadas em SQL bruto).
- **Edite, não recrie.** Para arquivos existentes, `Edit` cirúrgico — não reescreva o arquivo inteiro.
- **Escopo.** Se a feature explode em muitas unidades, sugira fatiar por sprint/WP (o EAP já costuma trazer essa divisão) e execute um por vez.
- **Sub-agente ≠ grátis.** Cada sub-agente começa com contexto fresco e relê arquivos que você já tem em memória. Só despache quando o ganho compensa o custo (área grande a explorar, dados não-triviais, segurança a auditar, tracks realmente independentes). Na dúvida, faça na sessão. Critérios por agente → `references/subagent-orchestration.md`.

## Navegação entre skills

| Situação | Skill | Onde roda |
|----------|-------|-----------|
| Criar a EAP de um módulo do zero | `eap-project-planner` | Codex.ai |
| Gerar prompts (sem executar) | `feature-planner` | Codex.ai |
| **Construir/executar a feature ou a EAP** | **feature-builder** (esta) | **Codex** |
| Limpar código órfão pós-sprint | `codebase-cleanup` | Codex |
| Atualizar docs `.Codex/` ao fim da sessão | `session-docs-updater` | Codex |