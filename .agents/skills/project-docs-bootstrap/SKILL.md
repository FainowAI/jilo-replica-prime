---
name: project-docs-bootstrap
description: "Mapeia um projeto existente (código no GitHub + banco no Supabase) e gera prompts para criar toda a documentação de fluxos na pasta `.Codex/` do repositório. Ative quando o usuário quiser inicializar a documentação de um projeto para o agente de código, criar a 'memória' de um repositório, gerar contexto persistente para sessões futuras, mapear fluxos existentes, ou preparar um projeto para usar a feature-planner com contexto. Também ative para: 'cria os docs do projeto', 'inicializa a .Codex', 'mapeia os fluxos do projeto', 'gera contexto para o agente', 'bootstrapa a documentação', 'quero que o agente entenda o projeto', 'documenta os fluxos atuais'. Ative mesmo para pedidos vagos como 'prepara o projeto pro agente de código' ou 'quero começar a documentar'. NÃO use para implementar features (use feature-planner) nem para projetos novos do zero (use eap-project-planner). Esta skill é para projetos que JÁ EXISTEM e precisam de documentação inicial."
---

# Website to HyperFrames

# Project Docs Bootstrap

Analisa projetos existentes (código + banco) e gera prompts para criar toda a documentação na pasta `.Codex/`, estabelecendo a memória persistente do projeto para sessões futuras do Codex.

## Por que isso existe

O Codex não tem memória entre sessões. Sem contexto, cada nova sessão precisa reler o projeto inteiro — consumindo tokens, tempo e aumentando risco de regressões. A pasta `.Codex/` resolve isso: um índice (`AGENTS.md`) que aponta para arquivos específicos, para que o agente carregue apenas o contexto relevante à tarefa atual, não o projeto inteiro.

Essa arquitetura segue o princípio de "AGENTS.md como índice, não como livro de regras" — colocar todo o contexto dentro do `AGENTS.md` causa poluição de contexto (context rot). O `AGENTS.md` é um roteador leve; os detalhes ficam nos arquivos dedicados.

---

## Ciclo de vida do projeto Fainow

Esta skill é a **Fase 5 (Documentar)** do ciclo de vida completo. Ela cria a memória que todas as fases seguintes dependem.

```
Fase 1 — ENTENDER
  product-discovery (Discovery Report)
      ↓
Fase 2 — PLANEJAR
  eap-project-planner (EAP + roadmap + schema + prompts kickstart)
      ↓
Fase 3 — CONSTRUIR (Sprint 0)
  Execução dos prompts de kickstart
      ↓
Fase 4 — LIMPAR
  codebase-cleanup (remove código órfão do vibe coding)
      ↓
Fase 5 — DOCUMENTAR
  ★ project-docs-bootstrap ★  ← ESTA SKILL
  Output: AGENTS.md + .Codex/project.md + requirements.md + roadmap.md + state.md + fluxo-*.md
      ↓
Fase 6 — ITERAR (Sprint N)
  feature-planner (lê .Codex/, gera prompts, atualiza docs)
  → volta para Fase 4 (Limpar) entre sprints
```

### Pré-requisito: codebase-cleanup

O ideal é que a `codebase-cleanup` tenha rodado antes desta skill. Se o projeto acabou de sair do vibe coding (Sprint 0/1) sem limpeza, esta skill vai documentar código que não deveria existir — componentes demo, páginas placeholder, hooks órfãos. Isso polui a memória do projeto.

Se a limpeza não foi feita, registre internamente `CLEANUP_MISSING = true` e inclua um aviso no AGENTS.md: "⚠️ Documentação gerada sem limpeza prévia — alguns artefatos documentados podem ser código órfão do scaffold inicial."

### De onde vêm os inputs complementares

Se existirem artefatos das fases anteriores, use-os para enriquecer a documentação:
- **Discovery Report** (product-discovery) → popula `project.md` (visão, público, problema) e `requirements.md` (regras de negócio da seção 9)
- **Documento EAP** (eap-project-planner) → popula `roadmap.md` (o que foi planejado, sprints, o que já foi executado)

Esses documentos não substituem a análise do código — eles complementam. O código é a fonte de verdade sobre o que foi implementado; o discovery/EAP são a fonte de verdade sobre o que deveria ter sido implementado.

### Próximo passo após esta skill

Após a documentação estar criada, o próximo passo é usar a `feature-planner` para cada feature seguinte. A feature-planner lê a pasta `.Codex/` na Fase 0 e atualiza os docs na Fase 6 — fechando o ciclo de memória.

---

## Inputs necessários

O usuário DEVE fornecer (ou você deve perguntar):

1. **Repositório GitHub** — owner/repo (ex: `FainowAI/fainow-crm`)
2. **MCP do banco de dados** — qual MCP usar para ler a base (ex: `supabase-fainow`, `supabase-be56`)
3. **Escopo** (opcional) — se quiser documentar só parte do projeto
4. **Discovery Report / EAP** (opcional) — se disponíveis na conversa ou na memória, usar como base para arquivos globais

Se o usuário não fornecer repo ou MCP, pergunte antes de iniciar. Se o contexto da conversa ou a memória indicam qual usar, confirme rapidamente e prossiga.

---

## Workflow (5 fases)

Execute TODAS as fases em sequência.

---

### FASE 1 — Mapeamento da arquitetura

**Objetivo:** Entender a estrutura completa do projeto antes de identificar os fluxos.

**Ações:**

1. Use `github:get_file_contents` para ler a estrutura do repositório:
   - Raiz: `package.json`, `tsconfig.json`, `vite.config.*`, `.env.example`, `README.md`
   - `src/` — estrutura geral de pastas
   - `src/pages/` — todas as páginas (cada página geralmente = um fluxo ou sub-fluxo)
   - `src/components/` — estrutura de componentes (pastas = domínios)
   - `src/hooks/` — hooks customizados (cada hook geralmente = uma feature de dados)
   - `src/lib/` ou `src/utils/` — utilitários compartilhados
   - `src/types/` — tipos e interfaces
   - `src/config/` — configurações, rotas, constantes
   - `src/contexts/` ou `src/stores/` — estado global
   - `supabase/` — migrations e edge functions

2. Use `github:get_file_contents` para ler os arquivos-chave de infraestrutura:
   - Router/config de rotas (como páginas são registradas)
   - Sidebar/navigation (quais seções existem na UI)
   - Auth/middleware (como funciona o controle de acesso)
   - Config do Supabase client (como a conexão é feita)

3. Mapeie os padrões do projeto:

| Padrão | O que anotar |
|--------|-------------|
| Stack | Framework, linguagem, strict mode |
| Routing | Centralizado? File-based? Lazy loading? |
| State management | TanStack Query? Zustand? Context? Redux? |
| UI library | shadcn? MUI? Ant? Tailwind puro? |
| Data fetching | Hooks custom? Fetch direto? Client Supabase? |
| Forms | React Hook Form? Zod? Controlled? |
| Auth | Provider? Roles? RBAC? |
| Notificações | Toast/sonner? Alert? |
| Tipagem | Strict? Database types gerados? `as any`? |

**Output:** Mapa mental da arquitetura. Prossiga para Fase 2.

---

### FASE 2 — Mapeamento do banco de dados

**Objetivo:** Documentar o schema completo e entender como os dados se conectam.

**Ações:**

1. Use `list_tables` do MCP indicado para listar todas as tabelas com colunas, tipos, defaults, FKs e constraints.

2. Use `execute_sql` para extrair informações estruturais:

```sql
-- Todas as tabelas
SELECT schemaname, tablename 
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Foreign keys (mapa de relacionamentos)
SELECT
  tc.table_name AS tabela_origem,
  kcu.column_name AS coluna_fk,
  ccu.table_name AS tabela_destino,
  ccu.column_name AS coluna_destino
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ENUMs e CHECK constraints
SELECT conrelid::regclass AS tabela, conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE contype = 'c' ORDER BY conrelid::regclass::text;

-- RLS policies ativas
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;

-- Views
SELECT table_name, view_definition
FROM information_schema.views WHERE table_schema = 'public';

-- Functions customizadas
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';

-- Triggers
SELECT trigger_name, event_object_table, event_manipulation, action_statement
FROM information_schema.triggers WHERE trigger_schema = 'public';
```

3. Agrupe as tabelas por domínio/fluxo (ex: tabelas de leads, tabelas de projetos, tabelas de auth, tabelas de financeiro).

**Output:** Schema completo agrupado por domínio. Prossiga para Fase 3.

---

### FASE 3 — Identificação e análise de fluxos

**Objetivo:** Cruzar código (Fase 1) com banco (Fase 2) para identificar todos os fluxos do sistema.

**O que é um "fluxo":**
Um fluxo é uma funcionalidade que tem começo, meio e fim do ponto de vista do usuário. Exemplos: "pipeline de leads", "dashboard financeiro", "gestão de projetos". Cada fluxo pode envolver múltiplas páginas, componentes, hooks e tabelas.

**Como identificar fluxos:**

1. Comece pelas **páginas** — cada grupo de páginas relacionadas geralmente mapeia para um fluxo
2. Cruze com **hooks** — hooks customizados indicam onde está a lógica de dados
3. Cruze com **tabelas** — FKs e relacionamentos mostram quais tabelas pertencem ao mesmo domínio
4. Considere **sidebar/navigation** — seções da navegação frequentemente correspondem aos fluxos

**Para cada fluxo identificado, faça análise profunda** usando `github:get_file_contents`:

- Quais páginas, componentes, hooks, tabelas participam
- Quais regras de negócio estão no código (condicionais, validações, cálculos)
- Quais integrações existem (edge functions, webhooks, n8n, APIs externas)
- Quais gotchas um dev novo precisaria saber

**Output:** Lista de fluxos com análise detalhada. Apresente ao usuário para validação antes de prosseguir.

Aguarde confirmação do usuário antes de prosseguir para a Fase 4.

---

### FASE 4 — Construção dos prompts

**Objetivo:** Gerar prompts sequenciais para o Codex criar toda a estrutura `.Codex/`.

A arquitetura de memória do projeto é organizada em dois níveis:

**Nível 1 — Arquivos globais** (contexto que se aplica ao projeto inteiro):
- `AGENTS.md` — índice/roteador (o agente lê primeiro e sabe onde ir)
- `.Codex/project.md` — visão, North Star, público-alvo, decisões arquiteturais
- `.Codex/requirements.md` — regras de negócio centralizadas (a "lei" do domínio)
- `.Codex/roadmap.md` — o que foi feito, o que está em andamento, o que falta
- `.Codex/state.md` — estado da última sessão (o que foi feito, onde parou, pendências)
- `.Codex/fluxo-infraestrutura.md` — stack, padrões, convenções técnicas

**Nível 2 — Arquivos por fluxo** (contexto específico de cada área do sistema):
- `.Codex/fluxo-[area].md` — um arquivo por fluxo identificado na Fase 3

**PROMPT 1 — Arquivos globais + AGENTS.md**

Este prompt cria a pasta `.Codex/`, o `AGENTS.md` na raiz, e todos os arquivos globais.

**Conteúdo do `AGENTS.md` (índice/roteador):**

```markdown
# [Nome do Projeto]

## Stack
[Stack completa em 1-2 linhas]

## Documentação do projeto
Este projeto usa documentação estruturada na pasta `.Codex/`.
Antes de alterar qualquer funcionalidade, leia o arquivo relevante.

### Arquivos globais (leia sempre que relevante)
- `.Codex/project.md` — Visão do produto, público-alvo, decisões arquiteturais
- `.Codex/requirements.md` — Regras de negócio (a "lei" — nunca viole sem aprovação)
- `.Codex/roadmap.md` — O que foi feito e o que falta
- `.Codex/state.md` — Estado da última sessão (leia PRIMEIRO ao iniciar uma sessão)
- `.Codex/fluxo-infraestrutura.md` — Stack, padrões de código, convenções

### Arquivos por fluxo (leia antes de alterar a área correspondente)
[listar todos os fluxo-*.md que serão criados]

## Convenções rápidas
[3-5 convenções mais importantes: naming, imports, tipagem — apenas o essencial]

## Regra de atualização
Sempre que um fluxo for alterado, o arquivo `.Codex/` correspondente DEVE ser atualizado.
Sempre que uma sessão terminar, atualize `.Codex/state.md` com o que foi feito e pendências.
Se um novo fluxo for criado, um novo arquivo de fluxo deve ser adicionado.
```

O `AGENTS.md` deve ser **curto** — no máximo 40-50 linhas. Ele é injetado em todos os prompts do Codex, então cada linha a mais gera custo cumulativo. Detalhes ficam nos arquivos que ele aponta.

**Conteúdo do `.Codex/project.md` (visão do produto):**

```markdown
# Visão do Projeto

## O que é
[1-2 frases descrevendo o produto]

## Para quem
[Público-alvo, personas se disponíveis]

## Problema que resolve
[A dor principal]

## North Star
[Métrica ou objetivo principal — ex: "aumentar conversão de leads em 30%"]

## Decisões arquiteturais
[Decisões tomadas e o porquê — ex: "Supabase ao invés de Firebase por RLS nativo"]

## Escopo do MVP
[O que está IN e OUT — copiar do discovery se disponível]
```

Se existir Discovery Report, popule com dados das seções 1-3 e 6. Se não, extraia do README, package.json e da análise do código.

**Conteúdo do `.Codex/requirements.md` (regras de negócio):**

```markdown
# Regras de Negócio

Estas são as regras de domínio do projeto. O Codex deve respeitá-las.
Violar uma regra sem aprovação explícita é proibido.

## Regras validadas
[Lista numerada de regras confirmadas]
1. [Regra extraída do código ou do discovery]
2. [...]

## Regras assumidas [HIPÓTESE]
[Regras inferidas mas não confirmadas — marcar para validação futura]
1. [HIPÓTESE] [Regra inferida]
```

Se existir Discovery Report com seção 9 (Regras de Negócio Consolidadas), use como base. Complemente com regras encontradas no código durante as Fases 1-3 (condicionais, validações, CHECK constraints).

**Conteúdo do `.Codex/roadmap.md`:**

```markdown
# Roadmap do Projeto

## Concluído
[Lista do que já foi implementado — extrair dos módulos que existem no código]

## Em andamento
[Sprint atual, se conhecido]

## Próximo
[Próximas features planejadas — extrair da EAP se disponível]

## Backlog
[Features adiadas / Won't Have this time — extrair do MoSCoW se disponível]
```

Se existir documento EAP, use o roadmap de sprints como base. Se não, infira do código o que está "concluído" e deixe as demais seções com "[A definir]".

**Conteúdo do `.Codex/state.md`:**

```markdown
# Estado da Sessão

## Última atualização
[Data do bootstrap]

## O que foi feito
- Bootstrap da documentação .Codex/ (esta sessão)

## Pendências
- [Listar se houver algo identificado durante a análise]

## Notas para a próxima sessão
- Documentação recém-criada — validar se os fluxos estão completos
- [Outras notas relevantes]
```

Este arquivo é propositalmente simples no bootstrap. O valor real vem quando o `feature-planner` e sessões futuras o atualizam.

**Conteúdo do `.Codex/fluxo-infraestrutura.md`:** (mesmo template da versão anterior — stack, padrões de código, Supabase config, integrações)

Consulte `references/infra-template.md` para o template completo se disponível, ou use o template que já existia nesta skill.

**PROMPTS 2 a N — Um por fluxo**

Cada prompt cria um arquivo `.Codex/fluxo-[area].md` com o template padrão (visão geral, arquivos envolvidos, tabelas, regras de negócio, fluxo do usuário, integrações, gotchas).

**Regra crítica dos prompts de fluxo:** Os prompts devem conter o conteúdo COMPLETO que vai no arquivo `.md`. O Codex não deve precisar analisar o projeto novamente — toda a análise foi feita nas Fases 1-3.

**Exceção:** Se um fluxo é muito complexo e o prompt ficaria com 500+ linhas, quebre em seções e instrua o Codex a ler os arquivos relevantes para complementar.

---

### FASE 5 — Entrega do documento

**Objetivo:** Entregar um documento .md completo e copiável, pronto para execução no Codex.

**⚠️ REGRA INEGOCIÁVEL:** Os prompts DEVEM ser entregues em um arquivo `.md` via `present_files`.

**Estrutura do documento:**

```markdown
# Bootstrap: Documentação .Codex/ para [Nome do Projeto]

## Contexto
- **Repo:** owner/repo
- **Supabase:** ref/MCP
- **Stack:** [stack completa]
- **Data:** YYYY-MM-DD
- **Discovery Report:** [Sim/Não — se sim, usado como base para project.md e requirements.md]
- **Documento EAP:** [Sim/Não — se sim, usado como base para roadmap.md]

## Resumo
Este documento contém N prompts para criar toda a documentação do projeto
na pasta `.Codex/`. Após executar todos os prompts, o repositório terá:
- AGENTS.md (índice/roteador)
- .Codex/project.md (visão do produto)
- .Codex/requirements.md (regras de negócio)
- .Codex/roadmap.md (passado + futuro)
- .Codex/state.md (estado da sessão)
- .Codex/fluxo-infraestrutura.md (stack e padrões)
- .Codex/fluxo-[area-N].md (N fluxos documentados)

## Ordem de execução
1. PROMPT 1 — Criar AGENTS.md + arquivos globais + fluxo-infraestrutura.md
2. PROMPT 2 — Documentar fluxo: [area-1]
3. PROMPT 3 — Documentar fluxo: [area-2]
...

---

## PROMPT 1 — Criar AGENTS.md + arquivos globais
[conteúdo completo]

## PROMPT 2 — Documentar fluxo: [area-1]
[conteúdo completo]
...
```

**Fluxo de entrega (SEMPRE nesta ordem):**

1. Crie em `/home/Codex/bootstrap-project-docs-[projeto].md`
2. Copie para `/mnt/user-data/outputs/`
3. Use `present_files` para entregar ao usuário
4. Apresente cada prompt individualmente na conversa em bloco markdown

**Mensagem de handoff após entrega:**

```
✅ Documentação do projeto bootstrapada!

📋 Entregue: [N] prompts ([N] arquivos globais + [N] fluxos)
🧠 Arquitetura de memória: AGENTS.md (índice) → arquivos globais → fluxos por área

▶️ Próximo passo: Execute os prompts no Codex na ordem indicada.
   Depois, para cada feature nova, use `feature-planner` — ela já lê a pasta .Codex/.

⚠️ Lembre: entre sprints, rode `codebase-cleanup` para manter o código alinhado ao escopo.
   A feature-planner atualiza os docs automaticamente na Fase 6.

Você pode dizer: "Roda o feature-planner para [feature]"
```

---

## Regras gerais

### Sobre profundidade da análise
- Leia os arquivos REAIS — não adivinhe baseado em nomes de pasta
- Se um hook tem lógica complexa, leia o código e documente as regras de negócio
- Se uma tabela tem constraints ou triggers, documente-os
- Prefira mais detalhe a menos — é melhor documentar demais do que de menos
- Gotchas são a parte mais valiosa — dedique tempo extra para identificá-los

### Sobre escopo
- Projetos pequenos (3-5 fluxos): 1 documento com todos os prompts
- Projetos médios (6-10 fluxos): 1 documento, considere agrupar fluxos menores
- Projetos grandes (11+ fluxos): divida em 2-3 documentos por área do sistema
- O PROMPT 1 (AGENTS.md + arquivos globais) SEMPRE é o primeiro

### Sobre o AGENTS.md como índice
- O AGENTS.md é lido pelo Codex em TODA sessão — cada linha custa tokens em escala
- Máximo 40-50 linhas — é um roteador, não um manual
- Convenções: apenas as 3-5 mais importantes. Detalhes ficam em `fluxo-infraestrutura.md`
- A seção "Regra de atualização" é fundamental — é o que garante que os docs se mantenham vivos

### Sobre os arquivos globais (project/requirements/roadmap/state)
- `project.md` raramente muda — é a visão de alto nível. Só atualiza se o escopo do MVP mudar
- `requirements.md` muda quando novas regras de negócio são descobertas. O feature-planner adiciona regras na Fase 6
- `roadmap.md` muda a cada sprint — itens se movem de "Próximo" para "Concluído"
- `state.md` muda a cada sessão — é o arquivo mais dinâmico. O agente lê no início e atualiza no final

### Sobre consistência com a feature-planner
- Os arquivos gerados por esta skill são os mesmos que a feature-planner espera encontrar na Fase 0
- O formato (nome `fluxo-[area].md`, estrutura com seções de arquivos/tabelas/regras/gotchas) DEVE ser idêntico
- A feature-planner atualiza esses arquivos incrementalmente — por isso a estrutura precisa ser estável

### Sobre integrações e edge functions
- Documente TODAS as integrações externas, mesmo as que parecem óbvias
- Para edge functions, documente o contrato (input, output, autenticação)
- Para webhooks n8n, documente o payload esperado
- Para APIs de terceiros, documente quais endpoints são usados

---

## Navegação entre skills — quando usar cada uma

| Situação | Skill | Fase do ciclo |
|----------|-------|---------------|
| Projeto novo, entender o problema | **product-discovery** | Fase 1 — Entender |
| Discovery pronto, planejar execução | **eap-project-planner** | Fase 2 — Planejar |
| Sprint executado, código sujo do vibe coding | **codebase-cleanup** | Fase 4 — Limpar |
| Código limpo, criar memória do projeto | **project-docs-bootstrap** (esta) | Fase 5 — Documentar |
| Projeto documentado, implementar feature | **feature-planner** | Fase 6 — Iterar |
| Organizar trabalho do time em sprint | **sprint-planning** | Fase 6 (paralelo) |

---

## Exemplo de uso

**Usuário:** "Preciso documentar o fainow-crm para o Codex. Repo: FainowAI/fainow-crm, Supabase: supabase-fainow."

**Fluxo:**
1. **Fase 1:** Lê estrutura do repo — identifica React + TS + Tailwind + shadcn + Supabase + TanStack Query. Lê router, sidebar config, auth provider. Mapeia 15 páginas em 7 grupos.
2. **Fase 2:** Lista 25 tabelas, mapeia FKs, encontra 8 ENUMs, 12 RLS policies, 3 edge functions, 2 triggers.
3. **Fase 3:** Identifica 7 fluxos: pipeline-leads, dashboard-financeiro, gestão-projetos, auth-rbac, prospecção-linkedin, sdr-performance, admin-config. Analisa cada um em profundidade. Apresenta ao usuário para validação.
4. **Fase 4:** Gera prompts:
   - PROMPT 1: AGENTS.md (índice) + project.md + requirements.md + roadmap.md + state.md + fluxo-infraestrutura.md
   - PROMPTS 2-8: um por fluxo, com conteúdo completo
5. **Fase 5:** Cria `bootstrap-Codex-docs-fainow-crm.md`, entrega via `present_files`, apresenta prompts na conversa com handoff para feature-planner.