# Sincronização da `.claude/` (Fase 6)

Última etapa, **obrigatória**, mesmo em features pequenas. A pasta `.claude/` é a memória do projeto entre sessões — se ela ficar desatualizada, a próxima sessão (e o próprio `feature-builder` no futuro) parte de uma base errada.

Faça você mesmo, na sessão, com `Edit`/`Write` (é barato — você já tem todo o contexto). Não delegue isso a um subagent sem necessidade.

## O que atualizar

**A) `fluxo-*.md` relevante**
- Já existia → **atualize** com as mudanças (novos arquivos, tabelas, regras, gotchas).
- Não existia → **crie** o arquivo do fluxo e adicione o ponteiro no `CLAUDE.md`.
- Se o EAP marcava o fluxo como `[PLANEJADO]`, troque por descrição real do que foi construído.
- Estrutura sugerida: visão geral · arquivos envolvidos (paths) · tabelas · regras de negócio · fluxo do usuário · integrações · gotchas.

**B) `requirements.md`** (só se a feature introduziu regra nova)
- **Adicione** as regras validadas no gate à lista. Nunca remova regras existentes.
- Se uma regra existente mudou, atualize e marque: "Atualizado pela feature X em [data]".

**C) `roadmap.md`** (se a feature mexe no roadmap)
- Mova a feature de "Próximo"/"Em andamento" para "Concluído".
- Registre no backlog necessidades que surgiram durante a execução.

**D) `state.md`** (sempre)

```
## Última atualização
[Data — use a data real de hoje]

## O que foi feito
- Feature: [nome] — [resumo do que foi construído e executado]
- [N] arquivos criados, [N] editados
- [N] migrations aplicadas (via execute_sql)
- Verificação: [build/typecheck/lint — passou? saída resumida]

## Pendências
- [Listar se houver — ex: WP aguardando aprovação/review, achado MÉDIO de segurança no backlog]

## Notas para a próxima sessão
- [Contexto relevante: o que foi copiado de onde, decisões, riscos abertos]
```

## Regras
- Não remova documentação de outros fluxos.
- Se o arquivo já existia, **atualize preservando** o que continua válido — não reescreva do zero.
- Escreva em português brasileiro, específico com paths e nomes.
- Se a `.claude/` não existia (flag `DOCS_MISSING` da Fase 0), crie a estrutura mínima: `state.md`, e o `fluxo-*.md` do que foi feito. Sugira rodar `project-docs-bootstrap` depois para completar.

## Depois da sincronização

Sugira o commit seguindo o Git Flow institucional (`feature/*` → `develop` → `staging` → `main`) — **nunca** direto em `main`/`staging`, e **só commite se o usuário pedir**. Se a sessão acumulou scaffold/código órfão, sugira `codebase-cleanup` antes do próximo sprint.
