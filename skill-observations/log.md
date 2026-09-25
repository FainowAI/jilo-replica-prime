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

### Observation 6: WhatsApp de cliente — usar Evolution API, não o MCP whatsapp local
**Status:** OPEN

**Date:** 2026-09-25
**Session context:** Levantar o que o cliente (Jilo) falou sobre parceiros Alelo para escolher gateway e abrir tela de cadastro.
**Skill:** New skill candidate: client-context-lookup (ou jilo-context)
**Type:** internal
**Phase/Area:** Coleta de contexto (e-mail + WhatsApp + docs do repo)

**Issue:** O usuário disse que a lista de fornecedores estava "nos e-mails", mas ela estava no WhatsApp (mensagens de 16 e 22/09). O MCP `whatsapp` local tinha histórico só até 07/08, e a busca dele é difusa ("Alelo" casou com "paralelo"). O usuário precisou corrigir: "use o mcp da evolution". Na Evolution (instância `claude2`) a conversa estava completa. A lista também estava registrada no `state.md` e no board kanban (J-11), o que teria encurtado a busca.

**Suggested improvement:** Em buscas de contexto de cliente, a ordem seria: (1) `state.md` + board kanban do projeto; (2) Gmail; (3) WhatsApp **via Evolution** (`evolution_find_chats` → filtrar JSON por nome/JID → `evolution_find_messages` → filtrar por data com python). O MCP `whatsapp` local não deve ser usado como fonte de verdade.

**Principle:** Quando existem duas fontes para o mesmo canal, verifique qual está atualizada (data da última mensagem) antes de concluir que "não existe". E a fonte que o usuário cita ("está nos e-mails") é uma pista, não uma garantia: confira nos outros canais antes de responder que não achou.

### Observation 7: Controle negativo para separar "credencial errada" de "credencial não provisionada"
**Status:** OPEN
**Date:** 2026-09-25
**Session context:** Homologação de gateway de pagamento de terceiro; o usuário avisou de antemão "antes de me dizer que está errado, já temos as credenciais".
**Skill:** feature-builder
**Type:** open-source
**Phase/Area:** Verificação de integrações externas / gate de bloqueio

**Issue:** O gateway devolvia 401 "Client Id invalid" para credenciais legítimas. O argumento que convenceu foi mandar um identificador inventado, receber exatamente a mesma resposta e citar a documentação do próprio fornecedor ("a App só funciona após aprovação interna"). "Está dando 401", sozinho, é justamente o tipo de afirmação que o usuário já esperava ouvir e recusar.

**Suggested improvement:** Na seção de bloqueios externos do feature-builder, sempre que um serviço de terceiro recusar credenciais, exigir: (1) chamada de controle com um identificador falso; (2) comparar as respostas byte a byte; (3) citar a documentação oficial que descreve o estado (ex.: pendente de aprovação); (4) só então declarar o bloqueio, com as três evidências.

**Principle:** Uma falha só aponta a causa quando é comparada com um controle. Uma resposta idêntica para uma entrada válida e uma inválida prova que o sistema do outro lado ainda nem olha para a entrada, e isso encerra o debate "a credencial está errada?" sem depender de opinião.

### Observation 8: javascript_tool — loops longos congelam a aba e a saída é filtrada/cortada
**Status:** OPEN
**Date:** 2026-09-25
**Session context:** Leitura de um portal de desenvolvedor autenticado via extensão de browser.
**Skill:** claude-in-chrome
**Type:** open-source
**Phase/Area:** Extração de conteúdo de páginas autenticadas

**Issue:** Um crawl síncrono (await fetch em loop dentro do javascript_exec) estourou o timeout de CDP (45 s) e congelou o renderer. A saída do tool é cortada em ~1 KB e devolve "[BLOCKED: Cookie/query string data]" quando o texto contém strings com cara de credencial. O que funcionou: agendar o crawl com setTimeout guardando o resultado em window, consultar o progresso em chamadas curtas, e ler páginas longas com navigate + get_page_text, que devolve o texto inteiro.

**Suggested improvement:** Acrescentar à skill claude-in-chrome: "Para trabalho demorado, agende com setTimeout e consulte o progresso; nunca faça await de um loop dentro de uma única chamada. Para ler conteúdo, prefira get_page_text a devolver o texto pelo javascript_tool (limite de ~1 KB e filtro de credenciais)."

**Principle:** Ferramentas de automação têm tetos de tempo e de tamanho de saída que não aparecem na documentação. Para cada tipo de trabalho, escolha o canal cujo contrato o suporta: execução assíncrona com polling para tarefas longas, extração nativa de texto para leitura.

### Observation 9: Helper de produção que loga só a contagem de erros esconde a causa raiz
**Status:** OPEN
**Date:** 2026-09-25
**Session context:** E2E local do pagamento VR contra Shopify real; o draftOrderComplete falhou e o log dizia apenas "userErrors (1)".
**Skill:** feature-builder
**Type:** open-source
**Phase/Area:** Padrão de logging em integrações externas / debugging

**Issue:** Por regra de "nunca logar body de terceiro", o helper `shopify-draft-order.ts` registra só `userErrors (N)`. A mensagem real ("Enter a valid CPF/CNPJ") era o diagnóstico inteiro e ficou invisível; foi preciso instrumentar um interceptor de fetch no harness para lê-la. A regra protege contra PII no corpo de RESPOSTA de pagamento, mas `userErrors.message` da Shopify é texto de validação, sem PII.

**Suggested improvement:** No feature-builder, seção de integrações externas: distinguir "corpo da resposta" (não logar) de "mensagens de erro estruturadas do provedor" (logar, truncadas, sem campos de PII). Regra prática: se o erro vem num campo `message`/`code` de um envelope de erro documentado, ele é diagnóstico, não dado — logue.

**Principle:** Uma política de "não logar" aplicada em bloco converte cada falha do provedor em um mistério que só se resolve reproduzindo com instrumentação. O custo de um log a mais é zero; o custo de um log a menos é uma sessão inteira de depuração.

### Observation 10: Endurecer validação de auth sem conferir se o tráfego legítimo ainda passa
**Status:** OPEN

**Date:** 2026-09-25
**Session context:** Investigação de pedido Shopify "expirado" relatado pela cliente; ao cruzar com o espelho no Supabase, descobriu-se que o receiver de webhooks recusa 100% das chamadas com "Invalid HMAC signature" desde que o fix fail-closed (commit db9bcc2) foi para produção.
**Skill:** feature-builder (fase de verificação) / security-auditor
**Type:** open-source
**Phase/Area:** Verificação pós-deploy de mudanças de segurança

**Issue:** Um fix de segurança correto (webhook passou de "pula HMAC se não houver secret" para fail-closed, com fallback para outro secret) foi entregue e verificado só por testes/leitura de código. Ninguém conferiu os logs depois do deploy: toda chamada legítima da Shopify passou a levar 401, e o espelho de pedidos, o despacho de entrega e a gravação de endereço pararam em silêncio. Só apareceu por acaso, dias depois, investigando outro problema.

**Suggested improvement:** Na verificação do feature-builder e no checklist do security-auditor, sempre que a mudança endurecer autenticação/assinatura de um endpoint de entrada (webhook, callback, API pública), exigir uma prova de que o tráfego legítimo ainda passa: um evento real ou de teste do provedor aceito com 2xx, ou uma consulta aos logs da função depois do deploy (zero 401 ou nenhum pico de 401). Sem essa prova, a entrega fica "não verificada".

**Principle:** Uma checagem fail-closed transforma um erro de configuração em queda total silenciosa. Um endurecimento de segurança só está verificado quando o caminho legítimo foi exercitado de ponta a ponta. Provar que o caminho malicioso é bloqueado não basta.

### Observation 11: Webhook HMAC — verificar gzip antes de suspeitar do segredo
**Status:** OPEN
**Date:** 2026-09-25
**Session context:** Receiver de webhooks Shopify em Supabase Edge recusava toda entrega real com "Invalid HMAC"; o segredo estava correto.
**Skill:** feature-builder
**Type:** open-source
**Phase/Area:** Integrações externas / webhooks assinados

**Issue:** A investigação percorreu 4 hipóteses sobre o SEGREDO (webhook secret sobrescrevendo, app diferente, chave rotacionada antiga/nova, encoding UTF-8) antes de testar o TRANSPORTE. A causa era `Content-Encoding: gzip`: o runtime (Deno) não descomprime o body, `req.text()` devolve os bytes gzip como UTF-8 com U+FFFD, e o HMAC — assinado sobre o JSON descomprimido — nunca bate. Sondas pequenas (<1 KB) passavam porque o provedor só comprime payloads grandes, o que mascarou o bug e reforçou a hipótese errada. O experimento decisivo foi trivial: mesmo body, mesma chave, com e sem gzip.

**Suggested improvement:** No checklist de "webhook assinado recusa tudo mas o segredo parece certo", colocar como PRIMEIRO passo: reenviar o mesmo body assinado com e sem `Content-Encoding: gzip` e com tamanho ≥ o do payload real. E na implementação de qualquer receiver: ler `arrayBuffer()`, descomprimir conforme `Content-Encoding`, verificar HMAC sobre o resultado — nunca `req.text()` direto.

**Principle:** Quando um sistema recusa a entrada real mas aceita a sua réplica, a diferença está no que você não replicou — aqui, tamanho e compressão. Réplicas pequenas e "limpas" testam o caminho feliz do runtime, não o caminho que o provedor de verdade usa. Replique o payload real em tamanho e encoding antes de mexer em credenciais.

### Observation 12: Pedido vindo de doc externo do cliente — reconciliar cada item com git log -S antes de planejar
**Status:** OPEN

**Date:** 2026-09-25
**Session context:** Planejar correções de site + descrições de pratos a partir de um Google Doc do cliente (lido via MCP do Drive) e da Shopify.
**Skill:** feature-builder (Fase 0.A ingestão / Fase 2.6 reconciliação no modo avulso)
**Type:** open-source
**Phase/Area:** Ingestão de fonte externa

**Issue:** O doc do cliente foi criado semanas antes e ganhou itens novos no mesmo arquivo; o primeiro item (texto da faixa de entrega) já tinha sido aplicado num commit antigo. Só apareceu porque o grep pelo texto-alvo achou o texto já no código; `git log -S"<texto>"` confirmou o commit. Além disso, o export do doc veio cortado no meio de uma palavra e o arquivo tinha sido editado minutos antes da leitura (o autor podia ainda estar escrevendo).

**Suggested improvement:** Na Fase 2.6 do modo avulso, quando a entrada é um documento externo (Drive/Notion/PDF): (1) para cada item com texto-alvo explícito, grep o texto-alvo e rode `git log -S` — já presente = FEITO; (2) compare createdTime × modifiedTime do doc e releia logo antes de apresentar o plano; (3) se o texto termina truncado, marque o item como bloqueado e pergunte, sem inferir.

**Principle:** Documento de cliente é cumulativo e vivo; tratá-lo como lista nova refaz trabalho feito e planeja sobre um texto que ainda está mudando.

### Observation 13: Antes de afirmar que um gerador "não roda" ou "quebra um artefato", checar hooks pre* e o artefato commitado
**Status:** OPEN

**Date:** 2026-09-25
**Session context:** Correção de textos; cardápio duplicado num script gerador de arquivos SEO/llms.
**Skill:** feature-builder (Fase 2.5 impacto / Fase 3 plano)
**Type:** open-source
**Phase/Area:** Análise de impacto de scripts de geração

**Issue:** O plano afirmou "não vou rodar o gerador; sem o token ele regeneraria o sitemap sem as URLs de produto". Na verificação, `npm run build` rodou o gerador sozinho via `prebuild` (e o deploy da plataforma faz o mesmo), e o sitemap commitado já tinha só as rotas estáticas — as duas premissas estavam erradas. A consequência prática também mudou: o template do script é a fonte de verdade, e os arquivos gerados são sobrescritos a cada build.

**Suggested improvement:** Na Fase 2.5, quando a mudança toca arquivo gerado ou script gerador: (1) `grep '"pre' package.json` para achar hooks pre*/post* que o rodam implicitamente; (2) inspecionar o artefato commitado (`git show HEAD:<arquivo>`) antes de prever o que o script "quebraria"; (3) editar sempre o template e regenerar, nunca só a saída.

**Principle:** Previsão sobre o que um script faz vale menos que olhar o manifesto e o artefato atual — lifecycle hooks rodam código que ninguém chamou explicitamente.

### Observation 14: Digitar no admin da Shopify sem foco no campo dispara atalhos de teclado
**Status:** OPEN

**Date:** 2026-09-25
**Session context:** Criando um fluxo no Shopify Flow pelo Claude in Chrome; o texto foi digitado no campo "Diga o que você quer criar", mas o foco não estava no input.
**Skill:** claude-in-chrome
**Type:** open-source
**Phase/Area:** Digitação em SPAs com atalhos globais

**Issue:** O clique no campo não pegou foco (a janela tinha acabado de voltar a renderizar), e o texto longo foi interpretado como atalhos de teclado do admin da Shopify. Isso abriu em cascata "Todas as lojas", "Adicionar página" e "Adicionar coleção", e a aba travou. Nada foi salvo, mas foi preciso conferir pela API se nada tinha sido criado.

**Suggested improvement:** Antes de digitar texto longo em app com atalhos globais (Shopify admin, Gmail, GitHub, Linear), confirmar que o foco está no input: via find/read_page, conferir que o elemento focado é o campo, ou digitar 1 caractere e ler o valor antes de mandar o resto. Preferir form_input com ref, que escreve direto no elemento, em vez de computer.type.

**Principle:** Em SPA com atalhos de uma tecla, computer.type sem foco garantido vira uma sequência de comandos. Escrever direto no elemento (ref) é mais seguro que simular teclado.
