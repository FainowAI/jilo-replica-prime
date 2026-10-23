# Execução: grafo de dependências, tracks e subagents (Fases 3 e 5)

Como decidir entre executar **sequencial na sessão** (mais barato) ou **paralelo com subagents** (mais rápido, mais tokens), e como despachar com segurança.

## Princípio de custo

Cada subagent começa com **contexto fresco** — relê arquivos que você já tem em memória. Isso custa tokens. Então o paralelismo só compensa quando o ganho de tempo é real: tracks **independentes** e **substanciais**. Para trabalho pequeno ou acoplado, executar você mesmo na sessão é mais barato (reaproveita tudo que já foi lido nas Fases 0–2). **Na dúvida, sequencial.**

## Passo 1 — Grafo de dependências

Para cada unidade de trabalho (arquivo a criar/editar, migration, Server Action), identifique:
- **Inputs** — o que ela LÊ/DEPENDE para funcionar (tabelas, types, hooks, componentes, edge functions, env vars).
- **Outputs** — o que ela CRIA/ALTERA.

Unidade B **depende de** A se algum input de B é output de A. Monte mentalmente a lista `unidade → depende_de: [...]`.

## Passo 2 — Agrupar em tracks

Aplique nesta ordem:

1. **Database é sempre a track inicial bloqueante.** Migrations (CREATE/ALTER TABLE, policies, triggers, functions DB) e types globais derivados direto do schema novo vão para `track-database`. Alterar schema é a única operação que bloqueia todo o resto.
2. **Áreas independentes pós-database viram tracks paralelas.** Típicas: `track-frontend` (componentes + páginas + hooks de dados), `track-edge-functions` (Deno/serverless), `track-integracao` (webhooks, workflows externos), `track-types-app` (types não-DB, utils). Hooks de dados ficam na track que mais os usa.
3. **Dependência cruzada vai para a track de maior gravidade**, e o brief declara "Aguarda: track-X". Não funda duas tracks só porque há uma dependência — mantenha separadas e declare a espera.
4. **Docs é sempre a track terminal** (`track-docs`), sozinha, depois de todas — porque documenta o resultado final (Fase 6).

## Passo 3 — Decidir o modo

**Paralelo (subagents) só se TODAS forem verdadeiras:**
1. Existem **2+ tracks independentes** pós-database (fora de database e docs).
2. Cada uma tem **2+ unidades** próprias.
3. Total de unidades **≥ 5**.
4. As tracks são **file-disjuntas** — nenhum arquivo é escrito por duas tracks ao mesmo tempo.

Se qualquer uma falhar → **sequencial**. Reporte ao usuário em uma linha:
- Sequencial: "Sem paralelismo real ([motivo]). Executo na sessão, em ordem."
- Paralelo: "Identifiquei N tracks independentes (database → [frontend, edge-functions] → docs). Database primeiro, depois 2 subagents em paralelo."

## Passo 4 — Executar

### Database (sempre primeiro, sempre na sessão principal)
- Aplique a DDL pela convenção do projeto (via `apply_migration` ou `execute_sql` + commit do `.sql` — confirme no EAP/`fluxo-infraestrutura.md`; alguns setups têm gotchas com `apply_migration`). Use o blueprint do `data-architect` se você o despachou.
- Commit o `.sql` e espelhe no ORM/types se o projeto usa um (Drizzle/Prisma/types gerados).
- Confirme com `list_tables` que o schema bateu antes de liberar as tracks seguintes.

### Tracks pós-database

**Modo sequencial:** execute você mesmo, com `Edit`/`Write`, na ordem técnica (types → config/rotas → hooks → componentes bottom-up → páginas → integração → edge functions). Reusa o contexto já carregado.

**Modo paralelo:** verifique a disjunção de arquivos, depois despache **1 `feature-coder` por track independente no mesmo turno** (várias chamadas `Agent` numa só mensagem) para rodarem juntas. Se o agente `feature-coder` não estiver registrado neste projeto, caia para `general-purpose` colando a persona dele (conteúdo de `.claude/agents/feature-coder.md`) no prompt. Se houver risco de conflito de arquivos, use `isolation: "worktree"` por track.

#### Brief autocontido por track (subagent)

Cada subagent não tem o seu contexto. O brief precisa bastar sozinho:

```
Track: <nome> (ex: track-frontend)
Repo: <path local> · Branch: <feature/...>

Objetivo: <1-2 frases do que esta track entrega>

Arquivos a criar/editar (paths reais):
- <path> — <o que fazer>

Padrões a seguir (com exemplos reais do projeto):
- Siga o padrão de <arquivo existente> para <X>
- Use <design system / hook / util> já existente em <path>
- Naming: <convenção do projeto>

Regras de negócio aplicáveis (do gate / requirements.md):
- <regra final exata que esta track deve respeitar>

Método: ponytail (full)
- Menor diff que funciona, reuso antes de criar, stdlib/nativo antes de dependência, YAGNI.
- `Edit` cirúrgico, nunca recriar arquivo. Simplificação deliberada leva comentário `ponytail:`.
- Deixe UM check runnable para lógica não-trivial. Nunca simplifique validação/segurança/regra pedida.

NÃO toque:
- <arquivos/áreas de outras tracks>
- Respeite as regras de <.claude/requirements.md>

Ao terminar: rode <typecheck/build do workspace> e reporte a saída.
```

Quanto melhor o brief (paths reais, padrões concretos, o que não tocar), menos o subagent precisa explorar — e menos tokens gasta. Briefs vagos forçam o subagent a reler tudo.

### Integração (sessão principal, depois das tracks)
Quando as tracks terminam, costure na sessão principal: navegação, registro de rotas, permissões, fios soltos entre o que tracks diferentes produziram.

## Verificação (Fase 5.5)
Rode o build/typecheck/lint do(s) workspace(s) afetado(s) e mostre a saída real. Confirme migrations via `list_tables`. Conserte falhas antes de declarar pronto.
