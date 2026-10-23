# Orquestração de sub-agentes (quando despachar e como)

A feature-builder pode delegar partes do trabalho a **agentes nomeados** (em `.claude/agents/`) para acelerar a entrega. Este arquivo define **quando** vale despachar cada um, **como** dar o brief, e **o que fazer com o retorno**. A regra geral continua: sub-agente relê contexto e custa tokens — só despache quando o ganho é real. **Na dúvida, faça você mesmo na sessão.**

## Os quatro agentes

| Agente | Papel | Escreve? | Quando |
|--------|-------|----------|--------|
| `code-explorer` | Mapeia uma área do código existente (fluxo, padrões, dependências, arquivos essenciais) | Não (read-only) | Fase 1 |
| `data-architect` | Desenha schema/migrations/tipos ancorado no banco real; reconcilia DDL × realidade | Não (blueprint) | Fases 2–3 |
| `feature-coder` | Implementa uma track de código independente, dentro de um escopo fechado | Sim (na sua track) | Fase 5 |
| `security-auditor` | Audita RLS/RBAC, PII, validação, secrets, lógica sensível | Não (achados) | Antes da Fase 4 e na 5.5 |

> Os três que "não escrevem" entregam **análise/blueprint/achados** — a sessão principal é quem decide e aplica. Isso mantém o controle (e o gate de aprovação) na sessão principal.

## Tabela mestra — quando despachar

Avalie cada gatilho de forma independente; vários podem disparar na mesma feature.

| Gatilho na feature | Despache | Por quê |
|--------------------|----------|---------|
| Área do código grande, desconhecida ou com 2+ subsistemas a entender | **2–3 `code-explorer` em paralelo**, cada um numa faceta (feature similar, arquitetura, camada de dados/UX) | Mapear em paralelo é mais rápido que ler serial; cada um devolve os arquivos essenciais |
| Área pequena/familiar, ou a doc `.claude/fluxo-*.md` já cobre | **Nenhum** — leia inline | Explorer aqui só duplicaria leitura |
| Schema novo/alterado não-trivial (tabelas, colunas, constraints, índices, RLS), ou DDL de EAP a reconciliar | **1 `data-architect`** | Centraliza o desenho de dados ancorado no banco real e a reconciliação |
| Sem mudança de estrutura de dados (feature pura de UI/lógica de cliente) | **Nenhum** — pule o data-architect | Não há dado novo para desenhar |
| Feature toca controle de acesso, auth, PII/dado sensível, ou lógica de valor (preço/desconto/limite/permissão) | **1 `security-auditor`** antes da aprovação **e** de novo na verificação | Pegar brecha antes de aplicar é 10x mais barato; reauditar o código aplicado fecha o ciclo |
| Feature sem superfície de segurança (ex.: ajuste visual, copy) | **Nenhum** — declare "sem superfície de segurança" e siga | Auditoria aqui é ruído |
| Execução com **2+ tracks independentes, cada uma com 2+ unidades, total ≥ 5, arquivos disjuntos** | **1 `feature-coder` por track**, todas no mesmo turno | Paralelismo real compensa o custo de contexto |
| Execução pequena ou acoplada (1 track, ou tracks que compartilham arquivos) | **Nenhum** — execute na sessão | Sequencial reusa o contexto já lido (mais barato) |

Detalhes do grafo de dependências, agrupamento em tracks e thresholds de paralelismo → `references/parallel-execution.md`.

## Como despachar

- **Paralelo no mesmo turno.** Quando despachar vários agentes (ex.: 2–3 explorers, ou N coders), emita todas as chamadas `Agent` numa **única mensagem** para rodarem juntos.
- **Tipo do agente.** Use `subagent_type` com o nome do agente (`code-explorer`, `data-architect`, `feature-coder`, `security-auditor`). Se o agente nomeado não estiver registrado neste projeto, caia para `general-purpose` e cole a persona/brief do agente no prompt (o conteúdo de `.claude/agents/<nome>.md` é o brief).
- **Brief autocontido.** Cada agente parte de contexto zero. O brief precisa bastar sozinho: objetivo, paths reais, padrões a seguir (com exemplo do projeto), regras de negócio já validadas no gate, e o que **não** tocar. Brief vago força o agente a reler tudo e gasta tokens à toa. Template do brief de track → `references/parallel-execution.md`.

## O que fazer com o retorno

- **code-explorer:** leia você mesmo os arquivos essenciais que ele apontar — assim você constrói o contexto detalhado que vai usar para planejar e executar. O relatório é o índice; a leitura confirma.
- **data-architect:** o blueprint vira insumo do plano (Fase 3) e da aprovação (Fase 4). A sessão principal é quem aplica a migration — o agente nunca aplica. Valide o blueprint contra o banco se algo destoar.
- **security-auditor:** trate achados **CRÍTICO/ALTO como bloqueantes** — leve à aprovação (Fase 4) e resolva antes de declarar pronto (5.5). Achado MÉDIO vira recomendação/backlog.
- **feature-coder:** ao terminar as tracks, **costure a integração na sessão principal** (rotas, navegação, permissões, fios entre tracks) — não delegue a costura. Rode a verificação consolidada.

## Princípio de custo (repetindo, porque importa)

Cada sub-agente começa com contexto fresco e relê arquivos que você já tem em memória. Despachar 3 explorers para uma feature de 1 arquivo, ou 1 data-architect para uma feature sem banco, **queima tokens sem ganho**. O paralelismo paga quando o trabalho é grande e separável. Quando você hesita, a resposta default é sequencial na sessão.
