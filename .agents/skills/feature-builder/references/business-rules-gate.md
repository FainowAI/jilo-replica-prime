# Gate de regras de negócio (Fase 0.B)

Princípio: **esta skill nunca supõe regra de negócio**. Se a feature muda lógica, ela para aqui e valida com o usuário **antes de executar qualquer escrita**. Sem suposição, sem "vou assumir que…".

## Atalho do Modo EAP

Quando a entrada é um documento EAP criado no claude.ai, muitas regras já chegam **travadas** — a EAP costuma ter uma tabela "Decisões da Fase 0 (travadas)", uma matriz de riscos e o schema definido. Nesse caso:

1. **Confirme** as decisões já documentadas em vez de re-perguntar ("O EAP trava X, Y, Z — confirma que sigo isso?").
2. Abra perguntas **apenas** para a lógica que o EAP não cobre explicitamente.
3. Registre no plano que as regras vieram do EAP (rastreabilidade).

No Modo avulso (pedido direto, sem EAP), rode o gate completo abaixo.

## Quando o gate ativa

Ative se a feature envolve qualquer um destes — ou se a heurística ou o usuário indicarem lógica nova:

| Gatilho | Exemplo |
|---------|---------|
| Cálculo ou agregação | "calcular comissão", "score médio", "delta 30d" |
| Critério de classificação | "lead BLACK", "rating SSS", "tier premium" |
| Fluxo de aprovação / estado | "aprovar", "moderar", "suspender usuário" |
| Condicional de negócio | "se X então Y", "exceto quando", "apenas para" |
| Permissão / RBAC | "só admin pode", "investidor não vê" |
| Visibilidade condicional na UI | "esconder botão se", "aba só para role X" |
| Validação / restrição | "não permitir mais de N", "bloqueia se faltar" |
| Trigger de evento / notificação | "notificar quando", "dispara webhook" |
| Prazo / SLA | "vence em N dias", "lembrete após" |
| Tratamento de exceção | "o que fazer se faltar dado", "fallback" |
| Migração / backfill | "atualizar registros antigos", "preencher coluna nova" |

**Heurística automática:** mesmo sem gatilho explícito, ative se o pedido tem verbo de comportamento (calcular, validar, decidir, classificar, filtrar, autorizar, recomendar), contém condicional ("se/quando/exceto/apenas"), ou toca código que já tem lógica documentada em `requirements.md`/`fluxo-*.md`.

**Em caso de dúvida, pergunte diretamente:** "Esta feature envolve regra de negócio nova ou alteração de lógica? (Sim / Não / Não tenho certeza)". "Sim" ou "Não tenho certeza" → gate ativa. "Não" → registre a decisão e prossiga.

**Exceção única:** bugfix cirúrgico de UMA linha em UM arquivo sem alterar comportamento (typo, cor, import).

## Como perguntar

Para cada lógica nova/alterada, traga uma **recomendação fundamentada** — ancorada, nesta ordem, em:

1. **Código existente** — padrões, hooks/funções similares já no projeto.
2. **Banco** — constraints, RLS, dados reais consultados via `execute_sql`.
3. **`requirements.md`** — regras já documentadas que orientam a decisão.

A recomendação não se baseia em "boas práticas genéricas" — baseia-se no que **este** projeto já faz. Seja concreto (uma frase com a alternativa óbvia, um trade-off de 2-3 caminhos, ou um SQL específico). Use perguntas tappáveis (`AskUserQuestion`) quando ajudar a decidir mais rápido.

**Validação obrigatória:** cada resposta do usuário precisa ser um destes três verbos. Respostas vagas ("acho que sim", "tanto faz") não contam — repergunte.
- **Confirmar** — segue a recomendação
- **Ajustar** — segue com a modificação que o usuário descreve
- **Rejeitar** — recusa e explica o caminho alternativo

## As 4 dimensões

Cubra as que se aplicam. Se uma não se aplica, **declare explicitamente** ("Dimensão 2 não se aplica: feature pura de UI sem RBAC") antes de pular — não pule em silêncio.

**Dimensão 1 — Regra exata**
- Inputs (campos, tabelas, eventos)?
- Cálculo/decisão exata (fórmula, condição, ordem de prioridade)?
- Output esperado (campo persistido, evento disparado, UI)?
- Edge cases (nulo, divisão por zero, dado ausente, valor negativo, lista vazia)?

**Dimensão 2 — RBAC e permissões**
- Quem pode acionar (role, organização, contexto)?
- Quem pode ver o resultado (visibilidade na UI, filtro por RLS)?
- Diferença de comportamento entre roles?
- Regra cruzada com permissões já em `requirements.md`?

**Dimensão 3 — Erros e exceções**
- Input falha validação → mensagem? bloqueio? fallback silencioso?
- Dependência externa cai → o quê?
- Conflito de concorrência (dois usuários no mesmo registro)?
- Erro deve ser logado, notificado ou ignorado?

**Dimensão 4 — Dados históricos e legados**
- Comportamento com registros anteriores à feature (retroativo? ignorar? marcar "legado"?)?
- Precisa backfill? Qual SQL?
- Risco de quebrar relatórios históricos?
- A regra é versionada ou substitui a anterior?

## O que fazer com as respostas

Registre cada regra validada no plano (Fase 4) e referencie na execução (Fase 5). Para cada uma:
- A pergunta feita
- A recomendação dada
- A decisão do usuário (Confirmar/Ajustar/Rejeitar + justificativa)
- A **regra final** exata como será implementada (inputs, cálculo, outputs, edge cases)

Cada unidade de trabalho que toca essa lógica deve seguir a regra final registrada. Na Fase 6, regras novas vão para `requirements.md`.

## Comportamento bloqueante

- Enquanto faltar resposta para qualquer dimensão aplicável, **não execute** — fica em leitura/planejamento.
- Se não souber qual recomendação dar: "não tenho dados suficientes para recomendar — preciso entender X antes" e pergunte.
- Se a resposta for ambígua, repergunte. Nunca interprete.
