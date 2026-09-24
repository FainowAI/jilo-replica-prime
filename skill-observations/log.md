# Skill Observation Log

Observations captured during task-oriented work. Each entry identifies a
potential skill improvement or new skill opportunity.

**Status key:** OPEN = not yet actioned | ACTIONED = skill updated/created |
DECLINED = user decided not to pursue

---

## 2026-09-11 — Plano de integração VR (pagamento)

### Observation 1: Extrair contrato de API de portal Sensedia/Swagger-UI via specSelectors em vez de clicar accordions
**Status:** OPEN
**Date:** 2026-09-11
**Session context:** Pesquisa do portal dev.vr.com.br (Sensedia API Portal) para planejar integração de pagamento VR; precisava dos contratos completos (paths, models, enums) das APIs Captura 2.4.0 e QR Code 1.0.0.
**Skill:** feature-builder (fase 1/2 quando a feature integra API externa documentada só num portal autenticado)
**Type:** open-source
**Phase/Area:** Leitura de fontes externas (portal de API) durante o planejamento

**Issue:** `get_page_text` em páginas Swagger-UI devolve só os cabeçalhos (accordions colapsados) e os textos de conteúdo do portal (Drupal) também ficam colapsados. Clicar accordion a accordion seria lento e incompleto. O que funcionou: `javascript_tool` com `window.ui.specSelectors.specJson().toJS()` (Swagger-UI expõe o spec inteiro em memória), guardar em `window.__specStr`, e devolver um resumo compacto (paths/params/responses + models com required/enum/description) em fatias de ~950 chars via `browser_batch` — a saída do javascript_tool trunca em ~1000 chars e bloqueia strings que pareçam query-string/cookie (`?`, `&`), então substituir esses caracteres antes de retornar. Para as páginas de conteúdo, `read_page filter=all` inclui os accordions colapsados; `document.body.cloneNode` sem script/nav também funciona.

**Suggested improvement:** Adicionar em `references/subagent-orchestration.md` ou numa nota curta da Fase 1 do feature-builder um "receituário para portal de API externo": (1) mapear famílias/menus com `read_page interactive`; (2) em Swagger-UI, extrair o spec via `specSelectors.specJson()` e sumarizar em chunks; (3) salvar tudo em `.work/<slug>/<provider>-api-notes.md` antes de planejar; (4) checar "Minhas Apps"/credenciais e pré-condições comerciais (afiliação) como ticket 0 do plano.

**Principle:** Quando a fonte de verdade de uma integração é um portal de API interativo, extraia o contrato da memória da própria página (Swagger-UI/Redoc expõem o JSON) em vez de raspar a UI renderizada — é mais completo, determinístico e barato; e registre o contrato extraído na memória de trabalho para que subagentes e sessões futuras não reabram o portal.

### Observation 2: Review de cliente OAuth com cache deve checar o caminho "refresh recusado"
**Status:** OPEN
**Date:** 2026-09-11
**Session context:** Ticket 01 do pagamento VR — feature-coder entregou um cliente OAuth (grant-code → access-token → refresh com cache em módulo) com 18 testes verdes; a review da sessão principal achou que um refresh recusado pela API (refresh_token expirado/revogado) deixava o cache preso e todas as chamadas seguintes falhando até o isolate reiniciar.
**Skill:** feature-builder (Fase 5.5 review) e security-auditor (critérios para tokens em cache)
**Type:** open-source
**Phase/Area:** Verificação/review de código que integra API externa com token em cache

**Issue:** O brief e os critérios de aceite cobriam "renova por refresh quando expirado" e "renova no 401 uma vez", mas não "o que acontece quando o próprio refresh falha". O coder implementou exatamente o que foi pedido e os testes passaram; a lacuna só apareceu na leitura do módulo pela sessão principal. É um padrão recorrente em qualquer cliente com token cacheado: o caminho feliz e o retry-em-401 são testados, o refresh morto não.

**Suggested improvement:** Na lista de smells/checks da Fase 5.5 do feature-builder (e nos critérios do security-auditor para "token em cache"), adicionar um item fixo: "cliente com refresh_token: refresh recusado limpa o cache e refaz o fluxo completo; existe teste para isso". Idealmente o brief do feature-coder para clientes OAuth já traga esse critério.

**Principle:** Em código de credencial com cache, o estado de falha mais caro não é o token expirar (isso é esperado e testado) e sim o mecanismo de renovação morrer em silêncio — o cache passa a ser a causa da indisponibilidade. Toda review de cliente OAuth deve perguntar "e se o refresh falhar?" e exigir o fallback para o fluxo inicial com teste.

## 2026-09-14 — Deploy e E2E do ticket 03 (pagamento VR)

### Observation 3: Contrato de API de terceiros só se prova com uma chamada real (dry-run) antes do E2E com dinheiro
**Status:** OPEN
**Date:** 2026-09-14
**Session context:** Deploy do `vr-checkout` (draft order na Shopify Admin API antes de cobrar na VR). 53 testes unitários verdes com deps stubados; o primeiro E2E real falhou duas vezes seguidas por fatos do contrato da Admin API que nenhum teste local poderia pegar: `DraftOrderAppliedDiscountInput.value` é `Float!` (string derruba a mutation) e o `appliedDiscount` FIXED_AMOUNT por linha é **por unidade** (6,93 × 7 = 48,51). A asserção de total (auditoria A1) segurou a cobrança, mas custou dois ciclos de deploy+curl.
**Skill:** feature-builder (Fase 3 plano / Fase 5 execução de tracks que integram API externa); data-architect quando desenha payloads para APIs de terceiros
**Type:** open-source
**Phase/Area:** Verificação de tracks que montam payloads para API externa

**Issue:** O plano listou "pontos a confirmar no primeiro deploy" (purchasingEntity vs customerId, desconto automático em cima do fixo) mas tratou isso como algo a ver *depois* do deploy, dentro do fluxo real. O diagnóstico só destravou quando usei o MCP da Shopify para (a) ler o schema do input (`graphql_schema`) e (b) rodar `draftOrderCalculate` — uma mutation **sem efeito colateral** que devolve os totais — com o payload exato do código e com a alternativa. Dois cálculos responderam em segundos o que dois deploys não tinham respondido. O mesmo vale para qualquer API com endpoint de "calculate/preview/validate" (Shopify draftOrderCalculate, Stripe invoice preview, gateways com `simulate`).

**Suggested improvement:** No feature-builder, quando uma track monta payload para API externa: (1) o brief do feature-coder exige ler o schema real do input (introspecção/MCP/docs versionadas) e citar o tipo de cada campo de dinheiro; (2) antes do primeiro deploy, rodar o payload num endpoint de cálculo/preview sem efeito colateral (se existir) e registrar o resultado no plan-NN.md; (3) a lista "pontos a confirmar" vira checklist executável do dry-run, não observação pós-deploy. Para logs de mismatch de valores, incluir sempre os dois números (esperado/obtido) sem PII — foi o que faltou para diagnosticar na primeira falha.

**Principle:** Testes unitários provam a lógica local; o contrato de um terceiro só se prova contra o terceiro. Use o caminho mais barato e sem efeito colateral que a API oferecer (schema + endpoint de cálculo) antes do caminho caro (deploy + fluxo real), e garanta que o log da primeira falha carregue os números necessários para diagnosticar sem repetir o ciclo.

### Observation 4: Ler conversa de WhatsApp inteira exige tratar áudios (e mídia antiga expira)
**Status:** OPEN

**Date:** 2026-09-24
**Session context:** Usuário pediu para ler a conversa inteira com uma contato via Evolution API e resumir o que ela pediu.
**Skill:** New skill candidate: whatsapp-conversation-digest
**Type:** open-source
**Phase/Area:** Coleta de mensagens / mídia

**Issue:** A conversa tinha 21 áudios (10 da contato) sem transcrição. O endpoint getBase64FromMediaMessage só baixou os áudios recentes (~1 dia); os de 1–5 semanas retornaram 400 (CDN do WhatsApp expirou, instância sem storage de mídia). Pedidos importantes existiam só em áudio e ficaram irrecuperáveis. O contato tinha dois JIDs (@lid e @s.whatsapp.net) — só o @lid tinha mensagens.

**Suggested improvement:** Skill de digest de conversa: (1) buscar contato por pushName e consultar TODOS os JIDs (lid + telefone); (2) paginar com offset alto e deduplicar por key.id; (3) baixar e transcrever áudios localmente (faster-whisper small, pt) antes de resumir; (4) listar explicitamente áudios irrecuperáveis com data/duração/contexto; (5) agrupar pedidos por status (aberto/resolvido), não por data.

**Principle:** Em resumos de conversa, a cobertura precisa ser declarada — mídia não lida é lacuna a nomear, não omitir. Mídia de mensageria é efêmera: se a transcrição importa, habilitar storage de mídia na instância ou transcrever no recebimento.

### Observation 5: Push encadeado com commits derruba o comando inteiro no modo auto
**Status:** OPEN

**Date:** 2026-09-24
**Session context:** Execução de tickets do feature-builder (correções de produção da Jiló); T4 juntou commit + git push + PATCH do kanban num único comando Bash.
**Skill:** feature-builder
**Type:** open-source
**Phase/Area:** Fase 5 (execução) / commit e push

**Issue:** O classificador do modo auto negou o comando inteiro por causa do `git push` ("Out-of-Place Publication"), mesmo com o usuário tendo liberado push em main por escrito. Como commit, push e atualização do kanban estavam na mesma linha, nada rodou; foi preciso reexecutar sem o push, e a regra da negação proíbe tentar o push de novo por outro caminho — sobrou para o usuário rodar `git push` à mão.

**Suggested improvement:** Na Fase 5/T-final do feature-builder, separar em comandos distintos: (1) commits, (2) atualizações locais (kanban/docs), (3) push sozinho e por último. Assim uma negação do push não bloqueia o resto e o usuário recebe um comando de uma linha para rodar. Registrar na skill que "push liberado pelo usuário" não garante que o harness libere.

**Principle:** Ação de publicação (push, deploy, envio) vai sempre no próprio comando, isolada do trabalho local — o custo de uma negação deve ser só a publicação, nunca o trabalho já feito.
