# Estado do projeto Jilo

## Sessão 2026-09-25 — Textos do site e dos pratos × receita real (doc do cliente no Drive)

Fonte: Google Doc "Informação sobre entrega" (dono `jilomarmitas@gmail.com`, criado 26/08, itens novos em 25/09). O 1º item (faixa "Entrega grátis em até 48 horas a partir de 7 unidades") já estava no `54b753c` (26/08).
- **Shopify (produção, já no ar):** 10 pratos — descrição + metafields (`guarnicao`/`proteina`/`base`/`alergicos`/`conservacao`) — Pizzaiolo (mussarela), Estrogonofe de Frango (batata cozida no molho), Frango Desfiado (componentes + 180 dias), Hambúrguer (90g), Picadinho (farofa de mandioca), Curry (lentilha verde, arroz branco c/ couve-flor, sem "baixo carboidrato"), Estrogonofe de Soja (sem cogumelo), Lasanha de Brócolis (massa de pastel, leite de amêndoa, alérgicos "glúten e amêndoa; traços de soja"). Renomeados (handle mantido): Tilápia Desfiada → **Filé de Peixe Desfiado**; Lasanha Bechamel com Calabresa → **Lasanha Bechamel com Presunto e Mussarela**. 0 userErrors; relido e conferido. Backup: `.claude/.work/correcao-textos-pratos/backup-shopify-2026-09-25.json`.
- **Site (working tree, sem commit):** FAQ (180 dias; sem "assinatura"; frete grátis a partir de 7; prazo sem "diariamente 18h–23h"; 5 a 6 min), HowItWorks/PreparationSteps/ProductComposition/Product (instrução = "5 a 6 minutos"; selos seguem "5 min"), CartDrawer (sem "Default Title"; `formatBRL` pt-BR), PixCallout (máx. 2 casas — mostrava "R$ 25,555"). `scripts/generate-seo-files.ts` + `public/llms*.txt` (cardápio, 180 dias, frete, área = São José dos Campos, sem assinatura) e `scripts/seed-products.ts` (títulos novos). Verificado: `tsc` limpo, Vitest 24/24, `npm run build` ok, Chrome em `localhost` (produto Lasanha de Brócolis + mini-carrinho).
- **Gotcha:** `npm run build` roda `prebuild` → `npm run seo`, que regrava `public/llms*.txt` a partir do template — o template é a fonte, não os `.txt`. O `sitemap.xml` commitado já tinha só as 8 rotas estáticas (sem token no `.env`); o build só muda `lastmod`.
- **Pendente do cliente:** receita da Calabresa com Mandioca (doc cortado em "mandi…"); qual peixe é o "Filé de Peixe Desfiado"; confirmar se a massa de pastel tem ovo e se a soja saiu da Lasanha de Brócolis; alérgicos do Nhoque (vegano, diz "leite (creme de milho)") e da Panqueca (mesmo texto colado); "Low carb" nos pratos de peixe com arroz/feijão; FAQ diz "PayPal" nas formas de pagamento.
- **Git:** nada commitado. `main` local está 1 à frente do `origin` (`1ac269c`, PIX) — um push leva junto. Ao commitar, stage só os 15 arquivos desta sessão (há VR sujo no working tree).

## Última atualização
2026-09-24 (Campanha de vendas começou em 23/09. Correções de produção: frete "Padrão R$ 22" no checkout (causa: `requiresShipping:true` nas 26 marmitas — revertido na Shopify), WhatsApp do site → SAC, cidade sem acento recusada. VR **fora de produção**: código completo (tickets 01–05) isolado na branch `feature/pagamento-vr`; App segue "Pendente" no portal da VR.)

## Sessão 2026-09-25 — VR: homologação pronta (bloqueio = VR) + 2 bugs reais achados pelo E2E local

**Contexto:** credenciais da VR do e-mail de 24/09 = "Minhas Apps"; App **Pendente** no gateway Sensedia (`grant-code` → 401 idêntico a UUID inventado; doc da VR: sem aprovação nem o sandbox roda). Nada a testar contra a VR; rascunho de e-mail (Felipe, cc Rose/Luiz) no Gmail, não enviado: pede aprovação, 2 cartões de teste (Refeição+Alimentação), padding RSA, "2.4.1 = 2.4.0".

- **Cliente VR completo** (`_shared/vr-client.ts`): reserva (`createReservation`/`getReservation`/`settleReservation` — PATCH em `/transacoes/pagamentos/{id}/reservas`, path do Swagger; a página do portal está errada), tokenização (`tokenizeCard`/`getTokenizedCard`/`deleteTokenizedCard`), `createPayment` com `cartaoTokenId`, `refund` devolve o estorno (parcial = valor < total). Runner de homologação `_hml/vr-homologacao.ts` (`--preflight`; 6 cenários das 5 funcionalidades exigidas pela VR; fallback OAEP→PKCS#1; evidências sem PAN). `.env.vr-hml` local (gitignored) com credenciais; faltam as linhas do cartão de teste.
- **E2E LOCAL com VR falsa** (`_hml/vr-checkout-e2e-local.ts` + `fake-vr.ts`; Shopify+Supabase reais, autorizado pelo dono): **9/9 cenários conforme especificado** — aprovados #1014/#1015/#1016 com centavos idênticos cart/VR/Shopify (12629/23927/7234), recusas 402, duplo clique 200+409 com 1 cobrança, falha no complete → 502 + estorno automático, timeout → reconciliado 200, fora de área 422, endereço alheio 403. 6 pedidos de teste (#1013–#1018) cancelados com restock.
- **Bug 1 (VR, corrigido e provado ao vivo):** `draftOrderComplete` → "Enter a valid CPF/CNPJ". A loja exige CPF do comprador (`localizedFields TAX_CREDENTIAL_BR`; todo pedido do checkout já tem). Fix: `cpf` obrigatório no body do `vr-checkout` (zod `^\d{11}$` + `_shared/cpf.ts` dígito verificador → 422 `invalid_cpf`), passa ao draft; `src/lib/vr/client.ts` reaproveita `card.documento`. **G3 ajustada:** CPF vai em claro no body só para o pedido Shopify; nunca persistido/logado. `profiles.cpf` não serve (1 de 16 preenchido).
- **Bug 2 (PRODUÇÃO, independente da VR, corrigido — DEPLOY PENDENTE):** `shopify-webhook-receiver` recusava todo webhook real ("Invalid HMAC") desde a v37 (14/09) — **nenhum pedido real entra em `orders` desde então** (#1012 de 25/09: 8 reenvios ERR). Causa provada: **gzip** (Shopify comprime ~7 KB; Deno não descomprime; `req.text()` = lixo U+FFFD). Segredo no cofre está certo (sonda com a chave Nova → 200; app `jiloapp` tem 2 chaves ativas, Antiga 03/03 e Nova 27/05). Fix: `_shared/shopify-webhook-body.ts` (`readRawBody` + `DecompressionStream`; HMAC em tempo constante). Reproduzido localmente: gzip 401→200, sig errada segue 401. Ver R48.3 em `fluxo-carrinho-checkout.md`.
- **Verificação:** Deno **91 passed / 0 failed / 1 ignored**; `tsc` limpo; Vitest 24/24.
- **Bloqueios do classificador:** deploy de Edge Function e criação de pedidos foram barrados em auto mode mesmo com "liberado" no chat; só o modo manual (Shift+Tab) destravou. Redeploy do `vr-checkout` (acento em `delivery-areas` + CPF) e do `shopify-webhook-receiver` **não feitos** — decisão do dono.

**Próximos (dono):** (1) deploy do `shopify-webhook-receiver` → conferir com a Julia como os pedidos da campanha (23/09→) foram despachados sem `orders`/Uber; (2) deploy do `vr-checkout` (só efetivo com `VITE_VR_ENABLED`); (3) enviar o e-mail à VR; (4) quando a App sair de Pendente: `.env.vr-hml` + `vr-homologacao.ts --preflight`; (5) commit (proposto abaixo, sem `settings.local.json`, sem `C:tmp…`, sem a linha da Alelo que é de outra sessão).

## Sessão 2026-09-24 — Correções de produção (pedidos da Julia) + VR isolado em branch

**Contexto:** a Julia (marketing) listou pendências no WhatsApp; a campanha começou em 23/09 (Luiz). Board local `julia-jilo` (`~/.fainow-kanban/boards/julia-jilo/`) e artifact para a Julia (https://claude.ai/artifact/28PVFgh6bNfVhfPTwAorzz).

- **Total com PIX errado no carrinho (T8, fim da tarde):** card do PIX mostrava 113,89 (5% só dos pratos) e o TOTAL 136,08 sem PIX; checkout cobra 129,28 porque o `PIX5` é desconto de PEDIDO e incide na linha de frete. Tentei restringir o PIX5 aos 26 pratos via Admin API (`discountCodeBasicUpdate` → classe PRODUCT): **quebrou o kit** (7 pratos → `PIX5 applicable:false`, não combina com o Kit automático) e foi revertido no mesmo minuto; provas com carrinhos da Storefront API (6+frete 129,28; 7 pratos 126,29 = Kit 6,93 + PIX 6,64). Regra final (dono): PIX 5% sobre pratos + frete, frontend espelha `cart.cost.totalAmount`. Ticket T8 despachado (`feature-coder` Sonnet): `computePixTotals` em `pixCoupons.ts`, `applyDiscountCode` → `refreshCartDetails`, TOTAL riscado + total com PIX, card "De/Por". Uber não depende do cupom (`update-shipping-variant-price` só muda o preço da variante).
- **VR em `main`, escondida (T7, mesma tarde — pedido do dono "jogue tudo para main"):** `feature/pagamento-vr` mesclada em `main` (`--no-ff`; conflitos em `.gitignore`/`state.md` resolvidos com a versão de `main`). Flag **`VITE_VR_ENABLED`** no `.env` (=`false`): `PaymentMethodSelector` filtra o método `vr` e `vite.config.ts` só injeta a meta CSP (A3) quando a flag é `true` (`loadEnv`) — o build de produção sai idêntico ao de hoje (sem opção VR, sem CSP). Espelho da normalização de acento aplicado em `supabase/functions/_shared/delivery-areas.ts` (+ `delivery-areas.test.ts`; `vr-checkout` NÃO foi redeployado — fazer no ticket 06). Verificado: `tsc` limpo, Vitest 20/20, Deno 16/16, build sem `Content-Security-Policy`; no Chrome, `localhost:5173` (flag off) sem VR e `localhost:5174` (`VITE_VR_ENABLED=true`) com "VR Refeição / Alimentação". Para ligar a VR: `.env` → `true`, redeploy `vr-checkout`, ticket 06.
- **Git (T0):** `main` = `origin/main` + `.gitignore` (`wa-logs.txt`, `mcp-logs.txt`, `.claude/.work/`, `.playwright-mcp/`). Todo o trabalho da VR (commit local "Teste" + tickets 04/05 do working tree) foi para **`feature/pagamento-vr`** (`db9bcc2`, 38 arquivos), sem os logs do WhatsApp MCP. Backup do estado anterior em `backup/local-2026-09-24`. Motivo: a opção "VR" aparecia no `PaymentMethodSelector` sem flag e a VR ainda devolve 401 — publicar quebraria o checkout VR para o cliente. Antes de mesclar: flag `VITE_VR_ENABLED`, homologação (ticket 06).
- **Frete R$ 22 (T3, produção):** Admin API mostrou as 26 marmitas com `inventoryItem.requiresShipping = true` e o perfil "Perfil geral" com taxa "Padrão" R$ 22 (BR). Revertido para `false` via `inventoryItemUpdate` (26 aliases, 0 erros). Verificado no navegador com carrinhos da Storefront API: 7 itens → total R$ 132,93 sem seção de entrega; 1 item → R$ 19,98 sem frete. Taxa "Padrão" mantida (decisão pendente do dono: zerar como seguro?). Não se sabe quem marcou "produto físico"; gotcha registrado em `fluxo-carrinho-checkout.md` e `CLAUDE.md`.
- **WhatsApp → SAC (T1):** `+55 12 97813-0583` nos 3 componentes, JSON-LD, gerador SEO/llms e `fluxo-infraestrutura.md`. `JILO_PICKUP_PHONE` (Uber) continua o do Luiz.
- **Cidade sem acento (T2):** `isAreaDeliverable` normaliza acento/caixa/espaços; teste Vitest novo. O espelho `supabase/functions/_shared/delivery-areas.ts` só existe na branch da VR — aplicar lá antes de mesclar.
- **VR (portal, 24/09):** App "Jilo Marmitas - Loja Online" continua **Pendente** (visto no portal com o login do Luiz). E-mail de 23/09: Felipe (VR) perguntou à Rose se falta credencial. Para produção a VR exige 5 testes em HML (inclui reembolso parcial e tokenização — conflita com G4/G8; decisão em aberto).
- **Alelo (Luiz, 16–22/09):** integração só via parceiro homologado (Adyen, Yuno ou Cielo E-commerce). Fora deste build.
- **Alelo (25/09) — SUPERSEDE da pesquisa de 21/09:** escolhido **Cielo E-commerce** (sem mensalidade, cadastro self-service, doc Alelo da Cielo atualizada em 30/10/2025). A pesquisa de 21/09 dizia "não usar Cielo" com base numa nota sem data do Pagar.me sobre o fim do contrato Cielo–Alelo; a própria Alelo (HugMe, 22/09/2026) listou a Cielo E-commerce como parceira homologada, e isso prevalece. Adyen (mínimo ~€1k/mês, venda consultiva) e Yuno (orquestrador, venda consultiva) ficam fora para o porte da Jilo. Ordem: contratar Cielo (`cielo.com.br/contrate-agora/?modality=API_ECOMMERCE`) → receber nº EC → pedir à Alelo a habilitação do voucher nesse EC. **Antes de codar:** confirmação por escrito da Alelo de que EC Cielo novo pode ser habilitado (`canaiscriticos.ec@alelo.com.br` ou HugMe). Planejamento deve avaliar escopo PCI (API Cielo recebe cartão aberto; Silent Order Post exige suporte Cielo). Detalhe em `.claude/.work/pagamento-vr/pesquisa-alelo.md`.
- **Pendências humanas:** publicar no Lovable após o push; conferir em produção; 2FA da Shopify para a Julia; alerta de estoque (Shopify Flow); treinamento Claude↔Shopify; acesso ao sistema da DaJu; áudios de 25/08 da Julia (expirados no WhatsApp).

## Sessão 2026-09-14 (cont.) — Ticket 03 deployado e testado ao vivo até a VR

- MCP `supabase-jilo` reconectou. Deploys: `vr-public-key` v1, `vr-checkout` v1→v2→v3, `shopify-webhook-receiver` v37 (tag `vr` → `payment_method` + HMAC fail-closed).
- **E2E real** (usuário QA `qa-vr@jilomarmitas.com`, cart de 7 un. + PIX5 = R$ 126,29): 401/403/400/422 conforme o plano; caminho principal chegou à VR e parou por falta de `VR_*` (502 `vr_error`, `vr_transactions.error='vr_bad_response:0'`, draft apagado).
- **Dois bugs pegos antes de qualquer cobrança** (a asserção "draft.total == valor" funcionou): `appliedDiscount.value` é `Float!`; FIXED_AMOUNT **por linha é por unidade** (6,93 × 7 → draft 84,71). Solução: um único `appliedDiscount` de ordem com a soma das alocações (13,57) — `draftOrderCalculate` bateu exatos 126,29. Detalhe em `.claude/.work/pagamento-vr/plan-03.md` e `_map.md`.
- **Achado crítico herdado (corrigido):** `shopify-webhook-receiver` aceitava webhook **sem assinatura** quando `SHOPIFY_WEBHOOK_SECRET` estava vazio — um POST forjado criou `orders` `gid://shopify/Order/1` (lixo limpo). v37 devolve 401 sem secret/assinatura, com fallback para `SHOPIFY_CLIENT_SECRET`. **Ação no próximo pedido real:** conferir os logs do receiver; `Invalid HMAC signature` ⇒ definir `SHOPIFY_WEBHOOK_SECRET` com o signing secret de Settings → Notifications → Webhooks (Shopify reenvia por 48 h). Não há webhook real desde 30/06 para validar hoje.
- Pendências do dono: secrets `VR_ENV=mock` (já pode) e `VR_CLIENT_ID/SECRET/ID_FILIACAO` (ticket 00, Luiz); rotação dos 3 secrets antigos; preview do Lovable não está no CORS do `vr-checkout` (ticket 04 testa no domínio real ou adiciona a origem).
- Próximo: ticket 04 (frontend) pode começar em paralelo ao 00; aceite final do 03 (cartão do mock aprovado/recusado, `refunded_auto`, idempotência paralela, 429) roda quando as credenciais chegarem.

## Sessão 2026-09-14 — Ticket 03: código integrado e verificado, deploy pendente

Sessão retomada 3 dias depois; os dois `feature-coder` do ticket 03 (tracks A e B, contrato em `.work/pagamento-vr/plan-03.md`) já não existiam — estado confirmado **no disco**, não por relatório. Track A (11/09): `_shared/pix-coupons.ts`, `kit-quantity.ts`, `delivery-areas.ts`, `storefront-cart.ts`, `vr-gates.ts` + 2 testes. Track B (até 12/09): `_shared/shopify-admin-client.ts`, `_shared/shopify-draft-order.ts`, `vr-public-key/index.ts`, `vr-checkout/index.ts` (handler `handleVrCheckout(req, deps)` com deps injetados + `buildDefaultDeps()`) + `vr-checkout/index.test.ts` (15 casos). Não entregue e dispensado: `shopify-draft-order.test.ts` (helper fino; o E2E contra a Shopify é o teste real).

**Verificação (14/09, saída real):** `npx -y deno check` limpo em `_shared/*.ts`, `vr-checkout/{index,index.test}.ts`, `vr-public-key/index.ts`; `npx -y deno test --allow-net --allow-env --allow-read supabase/functions/_shared/ supabase/functions/vr-checkout/` → **52 passed | 0 failed | 1 ignored** (ao vivo da VR). Review do orquestrador: sequência INSERT→draft→assert→pay→complete; 23505 + reconciliação de `authorizing` velha via `getTransaction`; timeout da VR resolvido por consulta; refund automático se o complete falhar; `zod().strict()`; JWT via `auth.getUser()` com header repassado; logs só com etapa + `id_transacao_van`.

**Verificado ao vivo na Storefront (11/09, cart descartável 7× Filé de Frango Pizzaiolo):** desconto de linha (Kit 6.93) e de ordem (PIX5 6.64) são **disjuntos**; `amountPerQuantity` é bruto; `subtotal − total = orderDiscount`. Registrado em `plan-03.md`.

**Pendências do ticket 03:**
1. **Deploy** de `vr-public-key`, `vr-checkout` (ambos `verify_jwt:false`, auth manual) e `shopify-webhook-receiver` v36 (tag `vr`) via MCP `deploy_edge_function` — arquivos nomeados `supabase/functions/<fn>/index.ts` + `supabase/functions/_shared/*.ts` importados. MCP caiu por timeout ao iniciar a sessão de 14/09; projeto Supabase está no ar (Auth/REST 200).
2. Smoke pós-deploy sem credenciais VR: 401 sem JWT, 400 body inválido, 422 gates.
3. E2E completo (draft → cobrança no mock → complete → webhook → `orders.payment_method='vr'`) exige `VR_CLIENT_ID/SECRET/ID_FILIACAO` + `VR_ENV=mock` nos secrets (ticket 00, Luiz). Confirmar no E2E: `purchasingEntity.customerId` aceito pela API version da loja; se a Shopify aplicar o desconto automático "Kit" em cima do `appliedDiscount` fixo (o assert de total pega e não cobra — então trocar para não enviar desconto de linha); `customAttributes` → `note_attributes`.
4. CORS do `vr-checkout` só libera `https://jilomarmitas.com` + localhost — preview do Lovable precisa ser adicionado se o ticket 04 for testado lá.

## Sessão 2026-09-11 (cont.) — Ticket 02 fechado: `vr_transactions` aplicada e verificada

Depois do restore (~20:07 UTC): Auth 200, PostgREST `[]`/200 com anon (RLS correto), Edge Functions 200. Migration aplicada via `apply_migration` → versão remota **`20260911200746_vr_transactions`** (arquivo local renomeado para o mesmo nome). Verificação ao vivo: RLS ligada; única policy deny-all `to anon, authenticated`; `set local role anon/authenticated → 0`; INSERT de 2 linhas no mesmo `cart_id` → `23505 vr_transactions_one_live_per_cart` (nada persistiu); trigger de `updated_at` confirmado; 0 linhas de teste restantes. `get_advisors(security)`: nenhum achado sobre `vr_transactions`; **WARNs pré-existentes** registrados como débito: `search_path` mutável em `handle_new_user`, `update_updated_at_column`, `ensure_single_default_address`, `sync_profile_default_address`, `log_order_status_change`; `handle_new_user` e `rls_auto_enable` são SECURITY DEFINER executáveis por `anon`/`authenticated` via RPC; leaked-password protection desligada. `types.ts` regenerado pelo MCP (ganhou `shopify_admin_tokens`, `vr_transactions`, `orders.placed_at`). Nota: `webhook_events` tem 0 eventos nos últimos 30 dias (sem pedidos no período + pause).

**Pendências do ticket 02 fora do código (usuário):** secret `VR_ENV=mock` já pode ser criado; `VR_CLIENT_ID`/`VR_CLIENT_SECRET`/`VR_ID_FILIACAO` só após o ticket 00; rotação dos 3 secrets pendentes desde 2026-06-28 antes de adicionar os da VR.

**Próximo frontier:** ticket **03** (`vr-checkout` + `vr-public-key`) está `ready` — código e testes stubados podem ser feitos já; o `curl` ponta a ponta contra o mock exige as credenciais do 00. Deploy do receiver (tag `vr`) vai junto.

## ✅ RESOLVIDO 2026-09-11 (usuário restaurou) — Projeto Supabase pausado (site sem backend)

Evidências: `hofohxvizlmawgkinwwz.supabase.co` **não resolve no DNS** (outros hosts resolvem); MCP `execute_sql`/`list_migrations` → "Connection terminated due to connection timeout" (mesmo sintoma já visto no mapeamento de hoje); `generate_typescript_types` → **"Project must be active and healthy"**; `query_logs` das últimas 24 h → **vazio** (nenhum edge/postgres log). Última sessão de trabalho foi 2026-08-26 → compatível com auto-pause do free tier por inatividade. Enquanto pausado: login, perfil, endereços, "Meus Pedidos", webhooks da Shopify (orders/paid → `orders`/Uber) e cotação Uber **não funcionam** no site. **Ação (usuário):** Dashboard Supabase → projeto → "Restore project"; depois conferir se a Shopify reenviou webhooks perdidos (ou re-registrar) e rodar `get_advisors`.

## Sessão 2026-09-11 (cont.) — Ticket 02 iniciado: `vr_transactions` (bloqueado pelo pause)

**Feito no working tree (sem aplicar):**
- `supabase/migrations/20260911000000_vr_transactions.sql` — blueprint da EAP §5.3 já com a auditoria: `user_id` nullable `on delete set null`; `id_transacao_van` unique ≤15; `status` CHECK fechado (inclui `refunded_manual`); RLS + **policy única deny-all** `to anon, authenticated`; **unique parcial** `(cart_id) where status in ('authorizing','approved')`; índices `(user_id, created_at desc)` e `(status, created_at desc)`; trigger `update_updated_at_column` (função já existente, mesma de `profiles`). Comentários de tabela/coluna codificam "nunca dado de cartão".
- `supabase/functions/shopify-webhook-receiver/index.ts` — `payment_method = 'vr'` quando `payload.tags` (CSV) contém `vr`; senão `payment_gateway_names[0]` como antes. **Decisão B1: tag, não note_attribute.** `deno check` limpo. **Não deployado** — vai junto do `vr-checkout` no ticket 03 (um deploy só, com teste ponta a ponta).
- Ambiente: `deno check` só passa dentro de `supabase/functions/<fn>/` (imports relativos a `../_shared`).

**Quando o projeto voltar:** `apply_migration('vr_transactions', <arquivo>)` → `get_advisors(security)` = `[]` → `pg_policies` só a deny → `set local role anon/authenticated; select count(*)` = 0 → `generate_typescript_types` → `src/integrations/supabase/types.ts`. Secrets: `VR_ENV=mock` pode entrar já; `VR_CLIENT_ID/SECRET/ID_FILIACAO` dependem do ticket 00; rotação dos 3 secrets pendentes (2026-06-28) antes.

## Sessão 2026-09-11 (cont.) — Ticket 01 executado: `_shared/vr-client.ts`

**Pedido:** "Pode executar" após o gate → ticket 01 (único de código pronto; 00 é do Luiz no portal). 1 `feature-coder` despachado com brief autocontido; verificação e review na sessão principal.

**O que foi feito:**
- `supabase/functions/_shared/vr-client.ts` (novo): OAuth grant-code → access-token com cache em módulo e refresh; `vrFetch` com timeout 30 s, retry único **só** em 401, vocabulário de erro fechado (`vr_timeout`/`vr_unauthorized`/`vr_http_<n>`/`vr_bad_response`, nunca o corpo da VR); `getPublicKey` (cache 10 min); `createPayment` (valor em centavos, 1 parcela, `id_filiacao` do env); `getTransaction`; `refund` idempotente (consulta antes); `classifyReturnCode` (tabela do enum → classe + mensagem PT-BR); `newIdTransacaoVan` (14 chars); `encryptCardData` (RSA-OAEP/SHA-256 via WebCrypto ou PKCS#1 v1.5 via `node:crypto`, aceita chave em PEM, base64-de-PEM ou DER; limite em bytes UTF-8). `VR_ENV ∈ {mock,hml,prod}` com hosts hardcoded, validado por chamada (não no escopo do módulo).
- `supabase/functions/_shared/vr-client.test.ts` (novo): 20 `Deno.test` com `fetch` stubado + 1 ao vivo (`ignore` sem `VR_CLIENT_ID`).
- **Review da sessão achou e o coder corrigiu:** refresh recusado pela VR (401/400) deixava o cache preso num `refresh_token` morto até o isolate reiniciar → agora limpa o cache e refaz o grant-code (teste novo).
- `deno.lock` ganhou `jsr:@std/assert` (esperado). Nada mais tocado.
- Nota de contrato corrigida em `vr-api-notes.md`: `GET /transacoes/pagamentos/{id}` **existe** na 2.4.0 (o Swagger inclui; a lista do portal omite).

**Verificação (saída real):** `npx -y deno check` limpo nos 2 arquivos; `npx -y deno test --allow-net --allow-env --allow-read supabase/functions/_shared/vr-client.test.ts` → **19 passed | 0 failed | 1 ignored**. (Deno não está instalado na máquina; `npx -y deno` resolve 2.9.6. Supabase CLI também ausente — deploy segue via MCP.)

**Fatos de ambiente:** mock da VR (`api-devportal.vr.com.br/captura/v2`) responde 401 sem credenciais; `POST api.vr.com.br/oauth/grant-code` exige `client_id` **também como header** (Sensedia). Conta da Jilo segue sem APP no portal → teste ao vivo fica para o 06.

**Próximo frontier:** ticket **02** (migration `vr_transactions` + secrets + decisão `payment_method`) está `ready` — exige o MCP `supabase-jilo` respondendo (`execute_sql` caiu por timeout durante o mapeamento; conferir antes). Ticket **00** continua com o Luiz. Pendências para o 06 anotadas no `_map.md`.

## Sessão 2026-09-11 — Plano: VR (Vale Refeição) como meio de pagamento

**Pedido:** plano por etapas/tickets para aceitar VR no site usando o gateway da própria VR (não Getnet). Sessão só de pesquisa e planejamento (feature-builder Fases 0–4; camada de tickets ativada).

**O que foi feito:**
- Portal `dev.vr.com.br` lido (conta do Luiz, já aprovada). API certa: **Captura 2.4.0** (Adquirência) — pagamento online síncrono com cartão VR criptografado em RSA (`GET /chaves/chave-publica` + `POST /transacoes/pagamentos`), estorno e reserva. **API QR Code é do lado do pagador → descartada.** OAuth 2.0 authorization-code server-to-server (`client_id` + `access_token` em header, 1h). Contrato completo em `.claude/.work/pagamento-vr/vr-api-notes.md`.
- **Bloqueio externo:** "Minhas Apps" no portal está **vazio** — sem APP não há credenciais. Fluxo: APP HML (OAuth 2.3.0 + Captura 2.4.0) → aprovação VR → sandbox → homologação → APP prod. Pré-condição comercial: `id_filiacao` do EC válido para online (confirmar com fpierro@vr.com.br). Formato exato do `cartao_dados_criptografados` não documentado.
- 3 `code-explorer` (frontend, backend, regras) → `code-map-*.md` na `.work/`. Achados-chave: `customer-orders` lê a Shopify ao vivo (pedido VR precisa existir na Shopify); `draftOrderCreate`+`draftOrderComplete` já validado (#1005) dispara os webhooks existentes; `PaymentMethodSelector` tem `onMethodChange` sem consumidor; `displayTotal` é só visual; CPF sem validação; marketing já promete "Pague com VA ou VR" sem implementação.
- **Desenho escolhido:** Shopify Cart continua motor de preço; Edge `vr-checkout` relê o cart no servidor, cobra `totalAmount` na VR e cria draft order pago com `customAttributes` (`selected_address_id`, `delivery_method`, `uber_quote_id`, `payment_method=vr`); webhooks/Uber/"Meus Pedidos" seguem inalterados. Nova tabela `vr_transactions` (sem dado de cartão). Estorno automático se o pedido falhar após aprovação.
- `security-auditor` despachado sobre o desenho → `.claude/.work/pagamento-vr/security.md`.
- `.gitignore` ganhou `.claude/.work/` (contrato da memória de trabalho).

**Gate de regras (CONFIRMADO 2026-09-11 pelo dono do produto):** **G1 ajustado — o desconto de 5% do Pix vale também para VR** (cupom `PIX5` aplicado ao escolher VR e garantido pelo `vr-checkout`; Kit e cupom manual valem) · G2 VR só no `/carrinho` · G3 CPF obrigatório (pré-preenche do profile, **não grava de volta** — auditoria M4) · G4 sem cartão salvo · G5 draft order antes de cobrar + estorno automático · G6 remover as outras bandeiras do marketing · G7 bloquear fora de área · G8 refund operacional v1.1 · G9 1 parcela · G10 Luiz opera o portal. Detalhe na EAP §4. O achado A2 da auditoria (`.work/pagamento-vr/security.md`) foi superado pela G1 — adendo no fim do arquivo.

**Auditoria de segurança incorporada (2026-09-11):** 2 críticos (idempotência TOCTOU → unique parcial em `cart_id` + INSERT-first; `authorizing` órfão → timeout sem retry + `GET` por `id_transacao_van`), 5 altos (draft **antes** de cobrar; `ph-no-capture` + CSP; rate limit + breaker global; `VR_ENV` enum + tag `vr-test` sem Uber fora de prod), 6 médios, 5 baixos — todos na EAP §6 e nos critérios dos tickets.

**Próximo frontier:** tickets **00** (portal/comercial — Luiz) e **01** (spike `_shared/vr-client.ts` no mock) podem correr em paralelo; o 03 já não tem bloqueio de gate. Executar com `/feature-builder` → "executa o ticket 01 de pagamento-vr".

**Nota de doc:** `CLAUDE.md` segue dizendo "NÃO há tabelas de pedidos no Supabase" (obsoleto) — corrigir no ticket 07 junto com o `fluxo-pagamento-vr.md`.

## Sessão 2026-08-26 — Ajustes do PDF

**O que foi feito:**
- Criado `src/components/WhatsAppFloatingButton.tsx`, montado globalmente em `src/App.tsx`, apontando para o atendimento oficial.
- Atualizada a comunicação para "Entrega grátis em até 48 horas a partir de 7 unidades." nos pontos de anúncio, benefícios, badge, carrinho, seletor e SEO; região exibida como São José dos Campos.
- Melhorado `src/lib/googleAuth.ts` e `src/components/GoogleSignInButton.tsx`: carregamento compartilhado do GSI, retry após falha, proteção contra desmontagem/callback duplicado e mensagens genéricas ao usuário sem PII.
- Nenhuma migration ou dependência nova.

**Pendências:**
- Instagram oficial adicionado ao rodapé; Facebook removido conforme solicitação.
- Configuração externa do Google (OAuth origins e provider Google no Supabase) precisa ser conferida no ambiente de produção após o deploy.

**Verificação:** `npm run build` passou; `npx tsc -p tsconfig.app.json --noEmit` passou; ESLint dos arquivos alterados passou com 1 aviso preexistente em `ShippingMethodSelector.tsx`; `npm run lint` global continua falhando por problemas preexistentes fora deste ajuste; `npm run test` ficou bloqueado por `Access is denied` ao resolver `vitest.config.ts` no ambiente.

2026-06-30 (Sprint A da EAP Visibilidade de Dados **FECHADO**: webhooks Shopify registrados (`orders/create`+`paid`+`fulfilled`) sob o app customizado + QA validado ponta a ponta (pedido #1005 → `webhook_events`/`orders`/`order_items`). Branch `main`. Ver sessão abaixo.)

2026-06-28 (Analytics destravado. Causa raiz: variáveis `VITE_` estavam nos Secrets do Supabase (canal errado) → bundle de prod saía sem a key do PostHog. Criado `.env` commitado com as públicas, ajustado `.gitignore`. PostHog + GA4 validados em produção. Branch `main`)

## Sessão 2026-06-30 — Endereço no Admin da Shopify (campo nativo via orderUpdate)

**Pedido do usuário:** o endereço PRECISA aparecer no **Admin da Shopify** (não só no nosso banco), idealmente "via metafield". Manter Uber + variante fantasma + requiresShipping=false.

**⚠️ Gate de regra de negócio:** colocar endereço (PII) em **metafield** viola **R65/LGPD** + decisão D5 da `eap_metafields_op.md` ("CPF, e-mail, telefone, nome, endereço jamais em metafield/tag"). **Solução melhor e compliant:** gravar no **campo NATIVO `shippingAddress` do pedido** via Admin `orderUpdate` — campo nativo é o lugar correto p/ PII de endereço (onde o billing já fica), NÃO é metafield. Validado ao vivo (orderUpdate no #1009 → apareceu no Admin).

**Implementação (1 feature-coder, ponytail) — `shopify-webhook-receiver/index.ts`:**
- Importa `getShopifyAdminToken`/`forceRefreshShopifyAdminToken` do `_shared` + consts `SHOPIFY_STORE_DOMAIN`/`SHOPIFY_API_VERSION`.
- Helper `callShopifyAdmin` (réplica do padrão de `customer-sync`, retry em 401) + `ORDER_UPDATE_MUTATION` + `setShopifyOrderShippingAddress(orderGid, addr)` (mapeia o endereço resolvido → `MailingAddressInput` Admin: `provinceCode`/`countryCode`; fail-soft; sem log de PII).
- No `orders/paid`, após o upsert: `if (!payload.shipping_address && baseOrderData.shipping_address) setShopifyOrderShippingAddress(shopify_order_id, ...)`. Só quando o endereço veio do Supabase.
- **Deploy: v34** (3 arquivos bundlados: index + `_shared/shipping-constants.ts` + `_shared/shopify-admin-auth.ts`; `verify_jwt:false`).

**Verificação ponta-a-ponta (automática):** pedido #1010 (draft com `selected_address_id` → paid) → webhook v34 → `order.shippingAddress` NATIVO na Shopify preenchido ("Rua 15 de Novembro, 50 / São José dos Campos / SP"). ✅ Aparece no Admin.

**Nota:** NÃO usa metafield (R65). NÃO precisa de ação manual na Shopify (campo nativo não exige definition nem shipping rate). Reusa OAuth Admin client_credentials (mesmo dos webhooks).

## Sessão 2026-06-30 — Path B: endereço resolvido no webhook (CAUSA RAIZ real)

**Reporte:** mesmo após o fix de cart (`cartDeliveryAddressesAdd`), pedido real `#1008` ainda vinha sem endereço (`shippingAddress: null`).

**CAUSA RAIZ REAL (mais profunda que a API de cart):** os produtos da loja são **`requiresShipping: false`** (confirmado: 25 de 26 variants + o variant "Frete Uber Direct"; única exceção "Estrogonofe de Proteína de Soja"=true). Quando o carrinho só tem itens sem envio, **a Shopify NÃO coleta endereço no checkout** (`shippingAddress`/`shippingLine` sempre null) e **ignora** qualquer `cartDeliveryAddressesAdd`/`deliveryAddressPreferences`. O `seed-products.ts` nunca seta `requires_shipping`. ⚠️ Isso também fazia o **`uber-create-delivery` abortar** (ele exige `order.shipping_address.address1`/`city`).

**Decisão (gate de arquitetura, escolha do usuário):** **Path B** — manter o modelo Uber + variant fantasma (não mexer no frete nativo da Shopify) e **resolver o endereço no backend** a partir do `selected_address_id`. (Path A = ligar requiresShipping + shipping rate nativo, descartado por ora.)

**Implementação (1 feature-coder, ponytail) — `supabase/functions/shopify-webhook-receiver/index.ts`:**
- Novos helpers `extractSelectedAddressId(payload)` + `resolveShippingAddress(payload)`: se `payload.shipping_address` for null, lê o `selected_address_id` dos note_attributes, busca na tabela `addresses` (service_role) e monta o JSONB no shape que o `uber-create-delivery` consome (`address1/address2/city/province/province_code/zip/country/country_code/first_name/last_name/name/phone`). Sem log de PII.
- Fiação nos handlers `orders/create` e `orders/paid`: `if (!orderData.shipping_address) orderData.shipping_address = await resolveShippingAddress(payload)` ANTES do upsert (garante que o dispatch Uber subsequente leia o endereço do banco).
- **Deployado: v32** (`verify_jwt:false` preservado — usa HMAC).

**Verificação ponta-a-ponta (dado real):** draft com `selected_address_id=6798834d-...` → pedido **#1009 PAID** → `orders.shipping_address` populado: "Rua 15 de Novembro, 50 / Centro / São José dos Campos / SP / 12249-027 / Antônio Oliveira". ✅

**⚠️ Consequência p/ a UI/admin:** o endereço fica no NOSSO `orders.shipping_address` (alimenta Uber + painel próprio), **NÃO no Admin da Shopify** (a Shopify nunca o coletou). Se um dia quiserem o endereço no Admin Shopify, é o Path A (requiresShipping=true + shipping rate).

**Pendência — fix de cart virou INERTE:** com requiresShipping=false, o `setCartDeliveryAddress` (`cartDeliveryAddressesAdd`) no frontend é no-op (Shopify ignora). Decidir: remover (limpeza) ou manter como future-proof p/ Path A. Hoje só o `selected_address_id` (note_attribute) importa para o Path B.

## Sessão 2026-06-30 — Fix: endereço de entrega não chegava à Shopify

**Reporte (pedido real #1006+):** pedido no Admin mostrava "Nenhum endereço de entrega informado"; só chegavam note_attributes `selected_address_id`, `delivery_method`, `return_url`. Billing aparecia (vem do pagamento/CPF), shipping não.

**Causa raiz (2 code-explorer despachados):** o checkout gravava só o `selected_address_id` (UUID) como note_attribute via `cartAttributesUpdate`; **nunca enviava endereço estruturado** à Shopify (zero uso de `cartBuyerIdentityUpdate`/`cartDeliveryAddressesAdd`/`buyerIdentity` no projeto). O objeto `Address` completo existia em memória no `DeliveryAddressSelector` (cache do `useAddresses()`) mas não era propagado ao `handleCheckout` (só a string id).

**Correção (1 feature-coder, método ponytail, 2 arquivos):**
- `src/lib/shopify.ts`: novo `setCartDeliveryAddress(cartId, address)` + `CART_BUYER_IDENTITY_UPDATE_MUTATION` — mapeia `Address`→`MailingAddressInput` (⚠️ Storefront usa `province`/`country` em texto, NÃO `provinceCode`/`countryCode` da Admin) e envia via `deliveryAddressPreferences`. Fail-soft se faltar street/cep.
- `src/pages/Carrinho.tsx`: reusa `useAddresses()` (queryKey dedupe), resolve o endereço por id e chama `setCartDeliveryAddress` nos 2 pontos de checkout (handleCheckout + effect pós-login), fail-soft (R26). Mantém o `selected_address_id` attribute.
- Regras: **R48.1** em `requirements.md` + `fluxo-carrinho-checkout.md` atualizado.

**Verificação:** `tsc --noEmit` limpo + `npm run build` ok. **Mutation validada AO VIVO** contra Storefront 2025-07 (cart descartável + token público): `cartBuyerIdentityUpdate` aceito, `userErrors: []`, sem erros GraphQL — confirma que o shape está certo e o fail-soft não mascara bug. **Validação ponta-a-ponta pendente:** 1 checkout real pós-deploy → conferir que `orders.shipping_address`/`customer_name` populam.

**⚠️ Storefront vs Admin MailingAddressInput:** Storefront `MailingAddressInput` = `province`/`country` (texto); Admin = `provinceCode`/`countryCode`. Não copiar o padrão da edge `shopify-customer-sync` (Admin) para código de Cart frontend.

**🔧 CORREÇÃO (mesmo dia, após checkout de teste do usuário ainda vir sem endereço):** o 1º fix via `deliveryAddressPreferences` (`cartBuyerIdentityUpdate`) estava **errado** — é só *prefill* de checkout, não anexa endereço ao cart, não é legível de volta via API e NÃO populava o `shipping_address` do pedido (por isso "passou" no teste de cart vazio mas falhou no checkout real). Trocado por **`cartDeliveryAddressesAdd` com `selected: true`** (`setCartDeliveryAddress` em `shopify.ts`), validado ao vivo: o endereço anexa e é legível em `cart.delivery.addresses` (`selected:true`). ⚠️ **2 APIs irmãs, campos DIFERENTES:** `cartDeliveryAddressesAdd`/`CartDeliveryAddressInput` usa `provinceCode`/`countryCode` (códigos), enquanto `deliveryAddressPreferences`/`MailingAddressInput` usa `province`/`country` (texto). `cartDeliveryAddressesReplace` não existe na 2025-07. (O fix ERRADO via deliveryAddressPreferences foi commitado/pushado em `998b36c`; a correção `cartDeliveryAddressesAdd` está **só no working tree** — `src/lib/shopify.ts` modificado, ainda NÃO commitado.) **Pendências:** commitar+pushar a correção → rebuild no Lovable → 1 checkout real → conferir `orders.shipping_address` populado.

## Sessão 2026-06-30 — Sprint A (Captação Shopify) ativado + QA validado

**Contexto:** o usuário pediu para "começar a 1ª sprint" da EAP `eap_visibilidade_dados.md`. Reconciliação (Fase 2.6) revelou que **todo o código das Sprints A/B/C já estava mergeado na `main`** (commits `b2e8dd0` A, `ac66a9f` B, `6691699` C; PR #9). Não havia código novo a construir. A metade do **cliente** (A.1) já estava fluindo: **6/6 profiles** com `shopify_customer_id` (EAP dizia 0/6). O único gap real era a metade dos **pedidos**: `webhook_events`/`orders`/`order_items` zerados porque os **webhooks nunca foram registrados** (`webhookSubscriptions` vazio na Shopify).

**Ação (ativação, não construção):**
- Rodada a edge `register-shopify-webhooks` → criou as 3 subscriptions (`ORDERS_CREATE`/`PAID`/`FULFILLED`) apontando para `…/shopify-webhook-receiver`, sob o **app customizado** (token via `client_credentials`). Re-rodada confirmou idempotência (`existing: [3]`).
- ⚠️ **GOTCHA DE INFRA (importante p/ próximas sessões):** as edge functions guardadas por `token === SUPABASE_SERVICE_ROLE_KEY` (ex.: `register-shopify-webhooks`) **NÃO aceitam mais o JWT legacy `service_role`** — o projeto tem o **novo sistema de API keys ativo** (existe `sb_publishable_…`), e o runtime das Edge Functions passou a injetar a **secret key nova (`sb_secret_…`)** em `SUPABASE_SERVICE_ROLE_KEY`. O JWT legacy ainda valida no PostgREST/REST, mas falha (401) no guard interno dessas funções. **Para invocá-las use a `sb_secret_…`** (Painel → Settings → API Keys → Reveal).
- ⚠️ Webhooks na Shopify são **escopados por app**: a query `webhookSubscriptions` pelo conector MCP (outro app) retorna `[]` mesmo com as subscriptions ativas — só o app customizado as enxerga. Isso é o que garante que o **HMAC bate** (Shopify assina com o secret do app criador = `SHOPIFY_WEBHOOK_SECRET`). Validação autoritativa = report da própria `register-shopify-webhooks`.

**QA (A.3.1) — validado ao vivo:** draft order via MCP (1× Filé de Frango Pizzaiolo) → `draftOrderComplete(paymentPending:false)` → pedido **#1005 PAID**. Resultado no banco: `webhook_events`=2 (`orders/create`+`orders/paid`, ambos `processed=true` → **HMAC ok**), `orders`=1 (`status=paid`), `order_items`=1 (qty 1, 1998 cents). `delivery_method=uber_direct`/`pending_dispatch` **sem dispatch Uber** (draft não tem `uber_quote_id` → receiver só logou warning; fail-safe de R36 correto).

**Pendência de limpeza:** pedido de teste **#1005** (tag `QA-TEST`, email `qa-test@jilomarmitas.com`) segue como pago/pendente de fulfillment na Shopify — **arquivar/cancelar** para não poluir métricas. Linhas de teste em `orders`/`order_items`/`webhook_events` permanecem como evidência (decidir se limpa).

**Nota de doc desatualizada (fora do escopo, reportado):** `CLAUDE.md` diz "NÃO há tabelas de produtos/pedidos no Supabase" — a parte de **pedidos** está obsoleta (`orders`/`order_items`/`webhook_events` existem e estão populadas). Produtos seguem só na Shopify (correto). Ajustar quando o usuário quiser.

## Sessão 2026-06-28 — Analytics destravado (variáveis VITE_ no cofre errado)

**Reporte/diagnóstico:** PostHog e GA4 corretamente implementados no código (`src/analytics/*`), mas nenhum evento chegava ao painel. Causa raiz medida: o bundle de produção **não continha `phc_`** — a `VITE_PUBLIC_POSTHOG_KEY` chegou ao build como `undefined`. As variáveis `VITE_*` de analytics estavam cadastradas nos **Secrets do Supabase** (que só alimentam Edge Functions, **nunca** o build do Vite), não existia `.env` versionado no repo, e o `.gitignore` bloqueava `.env`/`.env.*`. O código estava certo — problema 100% de **configuração de ambiente** (variável pública no cofre errado). Sem alteração de regra de negócio.

**Correção (3 arquivos, sem tocar em código de app):**
- `.gitignore` — bloco env reescrito: passa a **permitir `.env`** (`!.env`) e mantém `.env.local`/`.env.*.local` ignorados.
- `.env` (raiz, commitado) — criado só com as **8 variáveis `VITE_*` públicas** (Supabase anon/URL/project-id, `VITE_SITE_URL`, shipping variant ID, PostHog key/host, GA4 ID). **Segredos reais removidos** (estavam misturados no `.env` local antigo: `SHOPIFY_*`, `UBER_*`, `JILO_PICKUP_*`) — backup local no scratchpad.
- `.env.example` — criado documentando as variáveis esperadas.

**Passos manuais (usuário):** remover as `VITE_*` dos Secrets do Supabase (M2); republish/rebuild no Lovable (M3).

**Verificação (V1):** `phc_rDBmhU39` presente no bundle de produção; `window.posthog.__loaded === true` em `jilomarmitas.com`; `$pageview` chegando ao PostHog + `page_view` no Tempo real do GA4. **PostHog + GA4 validados em produção.**

**🔴 Pendência de segurança (registrada, adiada pelo usuário):** `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_CLIENT_SECRET` e `UBER_CLIENT_SECRET` apareceram em texto puro fora do cofre → **rotacionar os três** por precaução.

**Docs:** `requirements.md` ganhou **R78** (cofres de env separados); `fluxo-analytics.md` atualizado (canal `.env` vs Secrets + lição de configuração); este `state.md`.

## Sessão 2026-06-28 — Fix vazamento de RLS (orders, webhook_events) + regra permanente

**Reporte:** tabelas `orders`, `profiles`, `addresses` retornavam `200` com a anon key — suspeita de vazamento.

**Diagnóstico:** `profiles`/`addresses` NÃO vazavam — `200 []` (array vazio) é o comportamento correto do RLS (PostgREST não retorna 403). O vazamento real estava em `orders` e `webhook_events`: as policies criadas na migration `20260408_create_orders_tables.sql` foram declaradas **sem `TO role`**, então o Postgres as aplicou ao role `PUBLIC` com `USING(true)`/`WITH CHECK(true)` — qualquer requisição com a anon key tinha leitura/escrita total. Tabelas estavam vazias (0 linhas), por isso o sintoma era `200 []`, mas exporiam tudo assim que populadas. O `service_role` (edge functions) ignora RLS por BYPASSRLS, então as policies nunca foram necessárias para ele.

**Correção (migration `20260628000000_fix_rls_orders_webhook_events.sql`, aplicada via apply_migration):**
- `orders`: dropada a policy pública; recriada SELECT-own escopada a `authenticated`.
- `webhook_events`: dropada a policy pública; deny explícito para `anon`/`authenticated`.
- `profiles`: 3 policies endurecidas de `PUBLIC` → `authenticated` (+ `WITH CHECK` no UPDATE).

**Verificação:** `set local role anon` → `orders/webhook_events/profiles/addresses` retornam 0 linhas. `get_advisors(security)` não reporta mais RLS disabled/policy pública nessas tabelas. Edge functions intactas (todas usam `SUPABASE_SERVICE_ROLE_KEY`).

**Docs:** `CLAUDE.md` ganhou seção "Segurança de RLS" (regra permanente); `fluxo-infraestrutura.md` com tabela de policies atualizada + nota da correção.

**Follow-up (pré-existente, fora do escopo, reportado pelo advisor):** funções com `search_path` mutável; `handle_new_user` e `rls_auto_enable` são `SECURITY DEFINER` executáveis por anon via RPC; proteção de senha vazada (HaveIBeenPwned) desativada no Auth.
=======
2026-06-27 (Sprint C da EAP Visibilidade de Dados — GA4 + revisão SEO/Search Console. Branch `feature/visibilidade-dados-sprint-a`. Ver sessão abaixo.)

## ▶ HANDOFF — próxima sessão (começar por aqui)

Sprints A+B+C da EAP Visibilidade de Dados **codadas e buildando**. O que falta é tudo **provisionamento manual do usuário** + QA pós-deploy. Código não tem pendência de implementação.

**1. Provisionar contas/keys (USUÁRIO — sem isso o analytics/SEO fica inerte):**
- [x] **GA4 (Sprint C):** propriedade criada, Measurement ID **`G-LS2VBNXZKE`** já no `.env` e inlined no bundle (verificado). ⚠️ **FALTA:** setar `VITE_PUBLIC_GA4_MEASUREMENT_ID=G-LS2VBNXZKE` **no hosting (Lovable)** — sem isso o build de prod não enxerga. No Data Stream do GA4, desligar pageview do Enhanced Measurement (já temos `RouteChangeTracker`, senão conta em dobro).
- [ ] **Google Search Console:** verificar `https://jilomarmitas.com` (atalho: via GA4, 1 clique, se o GA já estiver no ar) OU colar o token no meta `google-site-verification` de `index.html` (hoje `PENDENTE_*`). Depois, **submeter `sitemap.xml`**.
- [ ] **Shopify Admin token:** o `SHOPIFY_ADMIN_TOKEN` do `.env` está **inválido (401)** — gerar um novo e atualizar `.env` + hosting. Destrava o **sitemap completo** (26 produtos + kits) e o `npm run seed`. ⚠️ Conferir loja canônica: `generate-seo-files.ts` tem `jnutg9-u2` hardcoded vs `.env` `jilo-marmitas`.
- [ ] **PostHog MCP:** token novo já validado e gravado no `.mcp.json` (rodar `/mcp` se precisar reconectar). PostHog do app já valida (project key `phc_rDBm…`, projeto 487943).

**2. QA pós-provisionamento (rodar SÓ em produção, domínio `jilomarmitas.com` — gate prod-only):**
- [ ] **PostHog (B.3):** eventos no painel Activity; jornada anônimo→identificado conecta no login.
- [ ] **GA4 (C.3):** Realtime mostra pageview por rota (C.3.1); DebugView confirma os eventos-chave (C.3.2).
- [ ] **SEO:** após token Shopify válido, conferir que `sitemap.xml` lista produtos/kits; Search Console sem erros de cobertura.

**3. Encerramento da fase (Z.1):** docs `.claude/` já atualizados nesta fase (requirements R70–R77, `fluxo-analytics.md`, este `state.md`). Quando o QA passar, considerar `codebase-cleanup` se sobrar código órfão.

**4. Git:** branch `feature/visibilidade-dados-sprint-a` tem mudanças **não commitadas** (Sprint C + correções SEO + wizard PostHog anterior). Nada commitado ainda — sugerir commit(s) seguindo Git Flow (nunca em `main`/`staging`) quando o usuário pedir.

## Sessão 2026-06-27 — Sprint C (EAP Visibilidade de Dados): GA4 (aquisição & canais)

Executada a **Sprint C** de `.claude/docs/eap_visibilidade_dados.md` via `feature-builder`, mesma branch. Frontend puro — **sem banco, sem dependência nova** (gtag direto via `<script>`, sem GTM — D6). Reusa o scaffolding da Sprint B (gate `analyticsEnabled` + `maskUrl`), sequencial na sessão principal (escopo pequeno, arquivos interdependentes).

**Decisões do gate (usuário):** sanitização de nome de evento p/ o GA4 em snake_case sem acento (necessidade técnica do GA4; PostHog mantém o nome PT-BR) — **confirmada**. Measurement ID será criado depois (código inerte até lá, igual à Sprint B).

**O que mudou (tudo verificado):**
- **C.1.2** `src/analytics/ga4.ts` (NOVO) — `initGA4()` injeta o gtag prod-only e `config` com `send_page_view:false`; `trackGA4`/`pageviewGA4`. Gate `ga4Enabled = analyticsEnabled && !!VITE_PUBLIC_GA4_MEASUREMENT_ID`. Reusa `maskUrl` (exportado de `posthog.ts`). Sanitiza nome de evento.
- **C.1.3** `src/analytics/RouteChangeTracker.tsx` (NOVO) — emite `page_view` no GA4 a cada rota (`useLocation`); montado dentro do `<BrowserRouter>` em `App.tsx`. PostHog continua capturando `$pageview` sozinho.
- **C.2.1** `src/analytics/track.ts` (NOVO) — dispatcher único; `events.ts` passou a importar `track` dele → os eventos do dicionário vão p/ PostHog **e** GA4 (fan-out). 1 linha alterada em `events.ts`.
- **C.2.2** masking reusado (mesmo `maskUrl`) no `pageviewGA4` — sem duplicar.
- `src/main.tsx` — `initGA4()` ao lado do `initAnalytics()`. `.env` — `VITE_PUBLIC_GA4_MEASUREMENT_ID=` (vazio/inerte).

**Segurança/LGPD:** mesma superfície da Sprint B — gate prod-only herdado, URLs mascaradas no GA4, eventos sem PII. Sem RLS/RBAC (frontend puro) — `security-auditor` não despachado, declarado.

**Verificação:** `npm run build` ✓ (2230 módulos, sem erro de TS/Vite). Regras novas: `requirements.md` R75–R77. `fluxo-analytics.md` estendido (GA4).

### Pendências Sprint C
- **[USUÁRIO] C.1.1** — criar propriedade GA4 + Web Data Stream e setar `VITE_PUBLIC_GA4_MEASUREMENT_ID` (`G-XXXXXXX`) no `.env` e no hosting de produção. Até lá o GA4 fica inerte (no-op).
- **QA (C.3) pós-provisionamento:** Realtime do GA4 mostra pageview por rota (C.3.1); DebugView confirma os eventos-chave (C.3.2).
- **Encerramento (Z.1):** com Sprints A+B+C feitas, a fase está pronta para o fechamento de documentação (já adiantado nesta sessão e nas anteriores).

### Adendo SEO / Google Search Console (mesma sessão)
Revisão da infra de SEO a pedido do usuário. Achados + correções:
- **`package.json`** — script `seo` passou a carregar o `.env`: `tsx --env-file-if-exists=.env scripts/generate-seo-files.ts`. Antes, o `tsx` não lia o `.env`, então `SHOPIFY_ADMIN_TOKEN` ficava indefinido e o `generate-seo-files.ts` caía no fallback de rotas estáticas → sitemap com só **8 URLs** (home + cardapio + kit-livre + 5 collections), **sem os 26 produtos nem os kits**. Com a flag, o token é lido e o sitemap inclui produtos/kits — **assim que houver token válido**.
- **`index.html`** — meta `google-site-verification` saiu de comentário para tag ativa com placeholder `PENDENTE_COLAR_TOKEN_DO_GOOGLE_SEARCH_CONSOLE`. O Google ignora placeholder (sem erro). Verificação alternativa: via GA4 (mesma conta Google) sem precisar do meta.
- **🔴 Descoberta:** o `SHOPIFY_ADMIN_TOKEN` do `.env` (`shpat_53fc…`) está **inválido (HTTP 401)** nas duas lojas (`jnutg9-u2` e `jilo-marmitas`). Por isso o sitemap segue com 8 URLs mesmo após a correção. Bloqueia: sitemap completo (SEO) e o `npm run seed`/scripts Admin. **Pendência [USUÁRIO]:** gerar um Admin API token novo no Shopify e atualizar o `.env` (e o build env do hosting).
- ⚠️ Nota: o `generate-seo-files.ts` tem a loja **hardcoded** `jnutg9-u2.myshopify.com` (linha 8), divergente do `.env` (`jilo-marmitas.myshopify.com`). Confirmar a loja canônica ao trocar o token.

### Pendências SEO / Google
- **[USUÁRIO]** Verificar o domínio no **Google Search Console** (`https://jilomarmitas.com`) e colar o token no meta de `index.html` — OU verificar via GA4.
- **[USUÁRIO]** Submeter `https://jilomarmitas.com/sitemap.xml` no Search Console após verificar.
- **[USUÁRIO]** Gerar Admin token Shopify válido p/ o sitemap pegar os produtos/kits.

## Sessão 2026-06-27 — Sprint B (EAP Visibilidade de Dados): PostHog (instrumentação de produto)

Executada a **Sprint B** de `.claude/docs/eap_visibilidade_dados.md` via `feature-builder`, na branch `feature/visibilidade-dados-sprint-a` (mesma branch acumula todas as sprints da fase). Frontend puro — **sem banco/migration**. Fundação + AuthContext feitos na sessão principal; instrumentação dos call-sites por 2 `feature-coder` em paralelo (file-disjuntos).

**Decisões do gate (usuário):** domínio prod = `jilomarmitas.com`; env vars fiadas no código, usuário preenche depois (analytics inerte até lá).

**O que mudou (tudo verificado):**
- **B.1 Fundação:** `posthog-js` + `@posthog/react` instalados. `src/analytics/posthog.ts` (init + gate prod-only `analyticsEnabled` + masking de PII via `before_send` + helpers `track`/`identifyUser`/`resetAnalytics`). `src/analytics/events.ts` (8 eventos tipados, sem PII). `src/main.tsx` (`initAnalytics()` + `<PostHogProvider client={posthog}>`).
- **B.2 Identify + eventos:** `AuthContext.tsx` — `identify(user.id)` no SIGNED_IN + restauração de sessão, `reset()` no SIGNED_OUT, eventos `login efetuado`/`cadastro concluído` (resolveu o comentário de coordenação da Seção 6). Instrumentação dos 8 eventos nos chokepoints: `cartStore` (item adicionado + kit montado), `Carrinho` (carrinho aberto + checkout iniciado), `CartDrawer` (carrinho aberto), `Product` (produto visualizado + checkout buy-now), `useAddresses` (endereço cadastrado).

**Segurança/LGPD:** gate prod-only (`!!KEY && PROD && hostname ∈ jilomarmitas.com`); identify só por `user.id` (sem email/CPF); masking de `/conta/pedidos/:id` e UUIDs no `before_send`; eventos sem PII; key via env (não hardcoded). Sem superfície de RLS/RBAC (frontend puro) — `security-auditor` não despachado, declarado.

**Verificação:** `tsc --noEmit` exit 0 · `npx vite build` ✓ (2227 módulos) · `vitest` 1/1. Regras novas: `requirements.md` R70–R74. Novo doc: `fluxo-analytics.md` (registrado no CLAUDE.md).

### Pendências Sprint B
- **[USUÁRIO] B.1.1** — criar o projeto PostHog e setar `VITE_PUBLIC_POSTHOG_KEY` + `VITE_PUBLIC_POSTHOG_HOST` no hosting de produção. Até lá o analytics fica inerte (no-op).
- **QA (B.3) pós-provisionamento:** confirmar eventos no painel PostHog (Activity) em prod (B.3.1) e jornada anônimo→identificado conectando no login (B.3.2). Validar que dev/preview NÃO emitem (gate).
- **Sprint C (GA4)** entra depois, reusando este scaffolding (gate + masking + dicionário de eventos).

## Sessão 2026-06-26 — Sprint A (EAP Visibilidade de Dados): Captação Shopify

Executada a **Sprint A** de `.claude/docs/eap_visibilidade_dados.md` (cliente + endereço + pedidos), com foco em segurança/LGPD, via `feature-builder` (3 subagentes em paralelo para edição + deploys/backfill no main). MCP Shopify autenticado no Claude Desktop usado para backfill (loja "Jilo Marmitas", `jnutg9-u2`).

**Decisões do gate (usuário):** webhooks via edge function com trigger pelo usuário; `order_items` incluído; backfill feito agora.

**O que mudou (código, tudo deployado e verificado):**
- **A.1.1** `supabase/functions/shopify-customer-sync/index.ts` — passou a anexar o **endereço default nativo** ao customer via mutation SEPARADA `customerAddressCreate` (`CustomerInput` não tem campo `addresses` na API 2025-10). FAIL-SOFT: erro de endereço nunca bloqueia o sync. Endereço vem da tabela `addresses` (default), não das colunas `profiles.*` (que estão vazias). Bairro → `address2`; `provinceCode`=UF; `countryCode`=BR. **CPF nunca é enviado** (D2/LGPD). Fallback de nome via `user_metadata.full_name` quando o profile ainda está vazio (signup). Deploy v25 (verify_jwt: true).
- **A.1.2** `src/contexts/AuthContext.tsx` — dispara `shopify-customer-sync` no evento `SIGNED_IN` (signup E login), deferido com `setTimeout(…,0)` p/ evitar deadlock do `onAuthStateChange`. Idempotente (a edge retorna `already_synced`). Comentário marca onde a Sprint B (PostHog) entra no mesmo handler (EAP Seção 6).
- **A.2.2** `supabase/functions/shopify-webhook-receiver/index.ts` — `orders/paid` virou **upsert defensivo** (`extractOrderData(payload)` + campos de pagamento): se `paid` chegar antes de `create`, a linha é criada em vez de perdida.
- **A.2.3** mesmo arquivo — popula `order_items` normalizado (`extractOrderItems`/`syncOrderItems`, delete-then-insert por `order_id`) no `orders/create` e no `orders/paid`, filtrando a variant fantasma de frete. Deploy v26 (verify_jwt: false).
- **A.2.1** `supabase/functions/register-shopify-webhooks/index.ts` (**NOVO**) — registra idempotentemente os webhooks `ORDERS_CREATE/PAID/FULFILLED` apontando p/ o receiver, usando o **app custom** (OAuth client_credentials inline) p/ o HMAC bater com `SHOPIFY_WEBHOOK_SECRET`. Guard: `Authorization: Bearer <SERVICE_ROLE_KEY>`. Deploy v1 (verify_jwt: false). **Disparo é manual (usuário)** — ver pendência.

**Backfill (A.3.3):** os 6 profiles órfãos agora têm `shopify_customer_id` (6/6). 4 customers criados via MCP (Julia/Fainow/Darlison/Luiz); 2 (marbergertony/enzosimoes) **já existiam do checkout** — receberam as tags `jilo-customer`/`source:supabase` e já tinham endereço. Endereço nativo anexado aos 3 novos com endereço no Supabase (Julia não tem; os 2 existentes mantiveram o endereço do checkout).

**Descoberta importante (HMAC):** o MCP Shopify do Claude Desktop roda sob o app **"Shopify Claude Connector App"** (apiKey `bff99d…`), DIFERENTE do app custom. Registrar webhooks por ele assinaria o HMAC com o segredo errado → 401 no receiver. Por isso A.2.1 usa o app custom. (O Connector App também roda uma API mais antiga — rejeitou o arg `identifier` do `customerCreate`.)

**Verificação:** `tsc --noEmit` exit 0 · `vitest` 1/1 · conteúdo deployado conferido byte-a-byte contra o disco (get_edge_function) · `register-shopify-webhooks`/`shopify-webhook-receiver`/`shopify-customer-sync` todos ACTIVE. **Sem migration** (todas as tabelas/colunas já existiam).

### Pendências Sprint A
- **[USUÁRIO] Disparar o registro dos webhooks** (A.2.1) — ver comando entregue na sessão. Enquanto não rodar, `orders`/`webhook_events` seguem vazias (nenhum pedido é capturado). Após disparar: fazer 1 pedido de teste e confirmar linha em `webhook_events` (processed=true) + `orders` + `order_items` (A.3.1).
- **[USUÁRIO] Confirmar que `SHOPIFY_WEBHOOK_SECRET` == client secret do app custom** — se divergir, o receiver retorna 401 em todo webhook (mitigação: validar com o pedido de teste).
- **Backlog (fora do escopo estrito da Sprint A):** (1) endereço adicionado DEPOIS do customer já existir não é re-enviado (sync idempotente por `shopify_customer_id`); (2) o webhook não preenche `orders.user_id` (RLS esconde o pedido do cliente em `/conta/pedidos`) — linkar por `customer_email`→`profiles` numa próxima passada.


## Sessão 2026-06-22 — Fix discrepância de desconto dos kits (frontend × Shopify)

**Bug:** páginas de kit (Leveza/Sabor/Força/Verde) e Kit Livre anunciavam 7→10%, 14→15%, 21→20%, 28→25%, mas o carrinho aplicava 7→5%, 14→10%, 21→15%, 28→20%. Cliente via "−10%" na página e recebia só "−5%" no carrinho (label "Kit 7 – 5% off").

**Causa-raiz (confirmada via Shopify Admin API MCP, loja live "Jilo Marmitas" / checkout.jilomarmitas.com):** os 4 Automatic Discounts ATIVOS são 5/10/15/20 (a planilha oficial) — nodes 1321712844940 (5%), 1321712910476 (10%), 1321713074316 (15%), 1321713139852 (20%). O frontend tinha `KIT_SIZES`/`KIT_TIERS` hardcoded em 10/15/20/25 e a doc `fluxo-kits.md` documentava 10/15/20/25 (errado). Duas fontes de verdade divergentes.

**Decisão de negócio validada (gate feature-builder):** escala oficial = 5/10/15/20. Alinhar o FRONTEND à planilha (baixar o anunciado), NÃO mexer no Shopify. Sem impacto de margem; cliente passa a ver o desconto real.

**Correção (só código + docs, nenhuma mutation no Shopify):**
- `src/pages/Kit.tsx` — `KIT_SIZES` discounts 10/15/20/25 → 5/10/15/20.
- `src/pages/KitLivre.tsx` — `KIT_TIERS` 10/15/20/25 → 5/10/15/20; SEO "até 25%" → "até 20%".
- `src/components/sections/WeeklyKits.tsx` — "a partir de" `× 0.90` → `× 0.95` (5% = menor tier).

**Docs atualizados:** `fluxo-kits.md` (tabela de Automatic Discounts + labels + saturação 20%); `fluxo-carrinho-checkout.md` (cenário de QA recomputado: Kit 7 −5% → base R$ 178,88; PIX5 −5% → R$ 169,94); `requirements.md` R61 (exemplos kit 7/28 → 5%/20%); esta entrada.

**⚠️ Correção das sessões anteriores:** as entradas da Sprint 5.2 (abaixo, 2026-06-15) usavam a premissa "kit 7 = 10% → R$ 169,47 → PIX 3% → R$ 164,39" — factualmente errada (o Shopify sempre aplicou 5%). Números de referência corretos: 7 pratos, subtotal R$ 188,30 → Kit 7 −5% = −R$ 9,42 → base R$ 178,88 → PIX5 −5% → R$ 169,94.

**Verificação:** `npx tsc --noEmit` exit 0; `vitest run` 1/1 passou.

### Pendências
- **QA manual:** abrir `/kit/kit-leveza` (e demais), conferir o selector mostrando −5/−10/−15/−20%; montar kit de 7 → carrinho deve bater com o anunciado ("Kit 7 – 5% off").
- Tiers seguem hardcoded em 2 lugares (`KIT_SIZES`, `KIT_TIERS`) + `WeeklyKits` — nada impede frontend e Shopify de divergirem de novo. Backlog: fonte única (ou ler do Shopify).


## Sessão 2026-06-22 (Uber pickup) — Correção do endereço de coleta da Uber Direct

**Demanda:** corrigir o endereço de coleta usado nas chamadas à API Uber Direct, usando o endereço do `CNPJ JILÓ.pdf` como fonte de verdade.

**Endereço correto (CNPJ JILO ALIMENTACAO LTDA, 05.574.020/0001-90):** Av. Engenheiro Juarez de Siqueira Britto Wanderley, 50 – Loja 05, Eldorado, São José dos Campos/SP, CEP 12238-565.

**Onde mora a config (achado):** o endereço de coleta NÃO está em tabela — está em **Edge Function Secrets** (`JILO_PICKUP_ADDRESS_JSON`, `JILO_PICKUP_LATITUDE`, `JILO_PICKUP_LONGITUDE`, `JILO_PICKUP_NAME`, `JILO_PICKUP_PHONE`), lido por `Deno.env.get(...)` (sem fallback) em `uber-quote` e `uber-create-delivery`. O MCP do Supabase NÃO escreve secrets (sem ferramenta) e `execute_sql` não alcança — então a correção é feita pelo Dashboard/CLI, pelo usuário. Decisão validada com o usuário (gate): manter em secrets, usuário seta.

**Valores corretos entregues ao usuário p/ setar (projeto `hofohxvizlmawgkinwwz`):**
- `JILO_PICKUP_ADDRESS_JSON` = `{"street_address":["Avenida Engenheiro Juarez de Siqueira Britto Wanderley, 50","Loja 05"],"city":"São José dos Campos","state":"SP","zip_code":"12238565","country":"BR"}`
- `JILO_PICKUP_LATITUDE` = `-23.2625966` / `JILO_PICKUP_LONGITUDE` = `-45.9155005` (geocode Nominatim+web, eixo da avenida).

**Docs:** `fluxo-uber-direct.md` (tabela "Pickup Jilo" agora traz os valores reais + nota de que são secrets não-graváveis por MCP); esta entrada.

**✅ Verificado (2026-06-22):** usuário atualizou os secrets pelo Dashboard. Testei a `uber-quote` ao vivo (cold start já aplicou o novo valor — sem redeploy): destino longe (Colinas Shopping, Av. São João 2200) → `address_undeliverable` com distância calculada 4,09 mi (>5 km); destino perto (Av. Cassiano Ricardo 601, Jardim Aquarius) → **200, fee R$ 21,90, quote_id `dqt_…`**. As distâncias batem com o novo pickup (Eldorado/Jardim Aquarius). Integração funcional.

### Pendências
- **Confirmar pino exato do nº 50** no Google Maps antes de produção (o geocode é o eixo da avenida; a Uber coleta na coordenada).
- **Usuário: revogar o Personal Access Token** colado no chat (`sbp_…`) em supabase.com/dashboard/account/tokens.
- Obs.: o MCP `get_logs` só retorna logs de acesso (200/502), não a linha `console.log` do payload — a confirmação foi comportamental (auth + cálculo de raio a partir do pickup), não byte-a-byte do `pickup_address`.


## Sessão 2026-06-22 (4.1 + 4.2) — Arredondamento do desconto + "a partir de" da home

**4.1 — Regra de arredondamento (DECISÃO, sem mudança de código):** o desconto de kit exibido (ex.: kit 7 = −R$ 6,93) é a alocação REAL do Shopify, lida em `cartStore.refreshCartDetails` das `line.discountAllocations[].discountedAmount` (não é calculado no frontend). O Shopify arredonda 5% por unidade para baixo (R$ 19,98 × 5% = R$ 0,999 → R$ 0,99 × 7 = R$ 6,93), vs R$ 6,99 dos 5% exatos. **Decisão validada com o usuário (gate):** MANTER o valor real (vitrine == checkout); não recalcular no frontend (recálculo reintroduziria a divergência das Inconsistências 1/2). Regra documentada em `fluxo-kits.md` (regra #4). A diferença (centavos, a favor da loja) é aceita.

**4.2 — "A partir de" da home (FIX de código):** os cards do `WeeklyKits.tsx` mostravam o preço/un de um tier intermediário (antes 10%, depois 5% após o fix da Inconsistência 1) — não o mínimo real. Corrigido para usar o **maior desconto** (kit de 28 = 20% off): fator `× 0.95` → `× 0.80`. Agora "a partir de" reflete o menor preço/un atingível: G1 R$ 15,98, G2 R$ 16,79, G3/G4 R$ 21,52 (confere com os valores do usuário). Kit Livre (menor preço entre kits) acompanha automaticamente.

**Verificação:** `npx tsc --noEmit` exit 0; `vitest run` 1/1.

**Docs:** `fluxo-kits.md` (regra #4 — arredondamento; regra #5 — fator do WeeklyKits); esta entrada.

### Pendências
- **QA visual:** home → cards "a partir de" devem mostrar R$ 15,98 (Leveza) / R$ 16,79 (Sabor) / R$ 21,52 (Força/Verde). Carrinho de 7 → desconto −R$ 6,93 (real do Shopify), batendo com o checkout.


## Sessão 2026-06-22 (Inconsistência 2) — Mini-carrinho não aplicava o desconto no total

**Bug (reproduzido ao vivo):** no `CartDrawer` (drawer lateral), a linha de desconto de kit aparecia, mas o "Total estimado" e o botão "Finalizar Compra" exibiam o SUBTOTAL CHEIO. Ex.: 7 pratos R$ 139,86, "Kit 7 – 5% off" −R$ 6,93 → drawer mostrava R$ 139,86 (errado); /carrinho mostrava R$ 132,93 (correto).

**Causa-raiz:** `CartDrawer.tsx` calculava `subtotal` cru e renderizava a linha de `cartDiscountAllocations`, mas os dois totais (l.221 "Total estimado" e l.238 botão) usavam `subtotal.toFixed(2)` direto — nunca subtraíam o desconto. O cálculo correto já existia em `Carrinho.tsx` (`kitDiscountTotal` → `displayTotal`). Defeito isolado no componente do drawer.

**Correção (cirúrgica, só `src/components/CartDrawer.tsx`):**
- Novo `kitDiscountTotal = Σ cartDiscountAllocations[].discountedAmount` e `totalWithDiscount = subtotal − kitDiscountTotal` (espelha Carrinho.tsx).
- "Total estimado" e botão "Finalizar Compra" passam a usar `totalWithDiscount`.
- Linha de desconto agora mapeia TODAS as allocations (`.map`) em vez de só `[0]`, garantindo que o total nunca divirja das linhas exibidas.
- Drawer NÃO inclui frete no total (mostrado à parte) — "Total estimado" = produtos com desconto, consistente com a UX do mini-cart.

**Verificação:** `npx tsc --noEmit` exit 0; `vitest run` 1/1.

**Docs:** `fluxo-carrinho-checkout.md` (seção CartDrawer + cenário de QA do total do drawer); esta entrada.

### Pendências
- **QA visual:** adicionar 7 marmitas, abrir o drawer → "Total estimado" e botão devem mostrar subtotal − desconto (ex.: R$ 132,93), batendo com o /carrinho.
- Formatação: o drawer usa `.toFixed(2)` (ponto) nos totais enquanto /carrinho usa vírgula (`.replace(".", ",")`) — inconsistência de formato pré-existente, NÃO tocada neste fix. Backlog se quiser padronizar.


## Sessão 2026-06-15 — Fix combinabilidade PIX × Kit (branch fix/checkout-pix)

**Bug:** com ≥7 marmitas (kit ativo), selecionar PIX no `PaymentMethodSelector` falhava — log `[PaymentMethodSelector] PIX coupon não aplicável { attemptedCode: 'PIX3', totalNonShippingItems: 7, shopifyResult: { success: true, applicable: false } }`. PIX5 (<7) funcionava normal.

**Causa-raiz (confirmada via Admin API):** `PIX3` e os Kits eram AMBOS da classe `PRODUCT` (`DiscountProducts`) sobre as mesmas marmitas. Na **Shopify Basic**, só UM desconto de produto aplica por linha de carrinho (empilhar dois product discounts na mesma linha exige `productDiscountsWithTagsOnSameCartLine`, exclusivo do **Plus**). O Kit (automático) ocupava a linha → o Storefront Cart API recusava o `PIX3` com `applicable: false`. As flags `combinesWith.productDiscounts: true` não resolvem — só permitem product+product em linhas DIFERENTES. Frontend estava correto; bug era 100% de configuração no Shopify Admin.

**Correção (aplicada via Admin API MCP nesta sessão, loja live `jnutg9-u2`):**
- `PIX3` recriado como **desconto de PEDIDO** (classe `ORDER`, `customerGets.items: { all: true }`, 3%, `combinesWith.productDiscounts: true`). Mesmo código `"PIX3"` — transparente pro frontend. O `PIX3` antigo (PRODUCT, node `1332035321996`) foi DELETADO; novo node `1342820876428`.
- Os 4 Kits (`Kit 7/14/21/28`) tiveram `combinesWith.orderDiscounts` alterado de `false` → `true` (combinabilidade bidirecional). Nodes: 1321712844940, 1321712910476, 1321713074316, 1321713139852.
- `PIX5` (<7) **inalterado** — classe `PRODUCT`, sem kit ativo abaixo de 7.

**Decisões de negócio validadas (gate feature-planner):**
- Empilhamento PIX+Kit confirmado: kit 7 = 10%+3% ≈ 12,7%; kit 28 = 25%+3% ≈ 27,25% (PIX incide sobre subtotal já com kit).
- Recriar PIX3 (vs editar in-place) — perdeu histórico de uso do cupom antigo (uso baixo, criado abr/2026).

**Código:** NENHUMA mudança de runtime. `pixCoupons.ts` e `PaymentMethodSelector.tsx` referenciam o código, não a classe.

**Docs atualizados:** R19 corrigida + nova R61 em `requirements.md`; tabela de constantes + regra #9 + gotcha PIX em `fluxo-carrinho-checkout.md`; esta entrada.

### Pendências
- **QA manual (validação E2E do fix):** carrinho de 7 marmitas + selecionar PIX → deve aplicar sem erro. Total esperado 7×R$26,90: subtotal R$188,30 → kit 10% → R$169,47 → PIX 3% → **R$164,39** (desconto efetivo só visível no checkout nativo Shopify, por R53/R60). Testar também 14/21/28.
- **Efeito colateral monitorar:** Kits agora combinam com QUALQUER order discount futuro. Cupom manual "Amount off order" empilhará automaticamente — se não desejado, criar com `combinesWith.orderDiscounts: false`.
- **`fluxo-kits.md`:** não editado nesta sessão — se mencionar combinabilidade do Kit, alinhar com R61 numa próxima passada.


## O que foi feito no merge (consolidação Sprint 5.1, 2026-06-15)

Duas linhas de trabalho rotuladas "Sprint 5.1" divergiram entre `main` e `fi` e foram integradas. O código mesclado contém AMBAS:

- **Da `main` (R56–R59):** kit em múltiplos de 7 (`src/config/kitQuantity.ts`), PIX efêmero reconciliado no load (`reconcileDiscountsOnLoad` + `src/config/pixCoupons.ts`), frete grátis blindado na transição, e o hard-block do checkout validando a PRESENÇA da linha de frete (`shopifyHasShippingLine`) em vez de comparar subtotais — imune a descontos. Detalhes nas seções abaixo ("Sprint 5.1" + "Correções pós-Sprint 5.1").
- **Da `fi` (R60 — desconto de kit visível):** `cartStore.refreshCartDetails()` agrega `line.discountAllocations` (o desconto de kit é `DiscountProducts`, aloca por linha, nunca em `cart.discountAllocations`) e popula `cartDiscountAllocations`; `Carrinho.tsx` exibe a linha verde de desconto, usa `displayTotal = (subtotal - kitDiscountTotal) + frete`, e passa a base já com desconto ao PIX (`subtotalCents={Math.round((subtotal - kitDiscountTotal) * 100)}`).

**Conflitos resolvidos no merge:**
- `src/stores/cartStore.ts` (`refreshCartDetails`): COMBINADO — a agregação de allocations (fi) E o `shopifyHasShippingLine` (main) coexistem no mesmo `set`.
- `src/pages/Carrinho.tsx`: mantém `kitDiscountTotal`/`productsTotalWithDiscount`/`displayTotal` com desconto (fi) e adota o `canCheckout` por `freightStateOk` + `isQuantityValid` (main, R59/R56). O antigo `totalMatchesShopify`/`expectedTotal`/`shopifySubtotal` (fi) foi **DESCARTADO** — substituído pela R59, que já é imune a descontos (resolve também o display do kit sem precisar da aritmética de subtotal).
- Docs: minha regra de agregação foi renumerada **R56→R60** (a `main` já usava R56–R59); `fluxo-carrinho-checkout.md` integra ambos os conjuntos; `fluxo-kits.md` traz a nota de agregação por linha.

### Pendências / Notas (pós-merge)

- **QA manual consolidado:** faixas 6 (pago) / 7,14,28 (grátis, libera) / 8 (kit inválido, trava com nudge) / transição 6↔7 observando o botão; reabrir o site com PIX de sessão anterior (deve sumir) e com cupom manual (deve ficar); kit de 7/14/21/28 → linha verde de desconto + TOTAL com desconto + checkout liberado.
- **Bug PIX no hard-block:** resolvido pela R59 (eliminou a comparação de subtotais) — confirmar no QA acima.
- **Débitos herdados ainda abertos:** edge `set-product-unlisted` obsoleta/perigosa (Sprint 5.0), HMAC `uber-webhook-receiver`, validação server-side de `shipping_fee_cents`, `PixCallout` estático "5% off". Encoding mojibake na seção Sprint 5.0 deste `state.md` (herdado da `main`) — corrigir quando reescrever a seção.

## Última sessão (Sprint 5.1 — kit múltiplo de 7 + frete grátis + PIX efêmero)
- R56: a partir de 7 marmitas só múltiplos de 7. Soft-block com gate único no canCheckout. Aviso acionável (botão "Adicionar mais N" → /kit-livre).
- R57: PIX (PIX3/PIX5) nunca grudento — reconcileDiscountsOnLoad remove no load, manuais (100teste) sobrevivem.
- R58: transição pra frete grátis blindada — remoção robusta da variant fantasma + "Atualizando frete grátis…".
- Criados: src/config/kitQuantity.ts, src/config/pixCoupons.ts, src/components/KitQuantityNotice.tsx.
- Editados: cartStore.ts, ShippingMethodSelector.tsx, Carrinho.tsx, CartDrawer.tsx, KitLivre.tsx, PaymentMethodSelector.tsx (refactor de import).
- 0 migrations, 0 edge functions. Loja confirmada: PIX5/PIX3 ACTIVE, 100teste manual; variant fantasma ACTIVE; kits 7/14/21/28 (teto 25%).

### Pendências
- QA manual: faixas 6/7/8/13/14/28/35 no carrinho e KitLivre; reabrir o site com PIX de sessão anterior (deve sumir) e com cupom manual (deve ficar); transição 6→7 observando o frete.
- Bug aberto do PIX no hard-block (pré-existente) segue fora de escopo. (Resolvido depois pela R59 — ver Correções pós-Sprint 5.1 abaixo.)

## Correções pós-Sprint 5.1
- Encoding: PaymentMethodSelector.tsx havia sido salvo com mojibake (UTF-8 lido como Latin-1) + BOM. Reescrito em UTF-8 correto. Causa provável: locale do ambiente que gravou o arquivo. Conferir LANG/LC_ALL ao gerar arquivos com acento.
- Checkout travado em ≥7 (R59): hard-block passou a checar presença da linha de frete (shopifyHasShippingLine) em vez de comparar subtotais — descontos de Kit (DiscountProducts) reduzem o subtotalAmount e quebravam o totalMatchesShopify. Editados: cartStore.ts (refreshCartDetails) e Carrinho.tsx.

### Pendência
- QA: 6 (pago), 7/14/28 (grátis, deve liberar), 8 (kit inválido, deve travar com nudge), transição 6↔️7 observando o estado do botão.

## O que foi feito na última sessão (Sprint 5.0 — Publicação no sales channel + status ACTIVE + filtro de catálogo)

> ⚠️ Correção de rumo: a hipótese inicial desta sprint (status `UNLISTED` resolve o bug) foi **testada empiricamente e refutada** via Playwright + Storefront/Admin API. O que segue é o diagnóstico verificado.

- **Bug raiz verificado (não era status):** o produto fantasma "Frete Uber Direct" (`gid://shopify/Product/9213544136844`, variant `48168478769292` — bate com o `.env`) estava publicado **apenas no sales channel "Point of Sale"**, NÃO no "Online Store". O token Storefront do frontend lê do canal Online Store. Em Shopify, disponibilidade via Storefront = **publicação no sales channel do token**, ortogonal ao status do produto. Por isso o `cartLinesAdd` da variant retornava erro explícito "A mercadoria … não existe" e o `node()` retornava `null` → a linha nunca entrava no Cart → hard-block do checkout sempre travado em "Sincronizando frete...".
- **UNLISTED NÃO funciona nesta loja (refutado):** depois de publicar o produto no Online Store mantendo `status: UNLISTED`, a variant continuou retornando `node: null` na Storefront em **todas as versões testadas (2025-07, 2025-10, 2025-01, unstable)** ao longo de vários minutos. Só ao mudar para `status: ACTIVE` (já publicado no Online Store) é que `availableForSale: true` e `cartLinesAdd` passaram a funcionar — verificado de ponta a ponta no `/carrinho` (botão "Ir para o Checkout" liberou, TOTAL R$ 29,44). NOTA: não foi feito o teste reverso limpo (ACTIVE→UNLISTED após propagação), então o fato verificado é "UNLISTED+publicado retornou null nos nossos testes", não "UNLISTED é impossível em qualquer cenário".
- **Correção aplicada (fix completo, escolhido pelo usuário):**
  - **Shopify (via Admin GraphQL):** produto fantasma `publishablePublish` no Online Store + `status: ACTIVE`.
  - **Código — filtro de catálogo:** como ACTIVE faz o produto aparecer em listagens (as queries `PRODUCTS_QUERY` não filtravam a tag), foi adicionado o helper `excludeInternalShipping(query?)` em `src/lib/shopify.ts` e aplicado em TODOS os call sites de catálogo (`AllDishes`, `FullMenu`, `Favorites` (2x), `KitLivre`, `Carrinho` sugestões, `Product` relacionados, `Collection`). Verificado: cardápio voltou de 27 → 26 pratos, "Frete Uber Direct" não vaza. A filtragem visual de `__internal_shipping` no carrinho (Carrinho/CartDrawer) continua valendo.
  - **`cartStore.ts` — validação pós-add (R55):** mantida como defesa em profundidade (após `addLineToShopifyCart` com sucesso para a variant fantasma, confirma via `fetchCartFull` que a linha entrou). Útil pra detectar regressões de publicação/status. (Os comentários internos que diziam "produto é unlisted" foram corrigidos pra "ACTIVE + publicado".)
- **O que NÃO mudou:** hard-block `canCheckout` (R52, Sprint 4.9), display local (R53), OAuth Client Credentials (R51), REPLACE atômico (R50), memoização (Sprint 4.6) — todos intactos.
- **Regras:** R54 (status ACTIVE + publicado no Online Store; UNLISTED não serve) e R55 (validação pós-add) em `requirements.md` — **reescritas** pra refletir a realidade verificada.
- **Arquivos editados:**
  - `src/lib/shopify.ts` (helper `excludeInternalShipping` + `INTERNAL_SHIPPING_TAG`)
  - `src/pages/{Carrinho,Product,Collection,KitLivre}.tsx` e `src/components/sections/{AllDishes,FullMenu,Favorites}.tsx` (filtro nas queries de catálogo)
  - `src/stores/cartStore.ts` (validação pós-add R55, da sessão anterior)
  - Shopify: produto `9213544136844` → ACTIVE + publicado no Online Store (via Admin API)

### Pendências / Notas para a próxima sessão

- **⚠️ A edge `set-product-unlisted` está OBSOLETA e é PERIGOSA:** ela seta `UNLISTED`, que **re-quebra o carrinho** (a variant some da Storefront). NÃO rodar. Decisão pendente do usuário: deletar a edge OU repropô-la como "set ACTIVE + publishablePublish(Online Store)" — que é o que um ambiente novo (staging) realmente precisa. A entrada em `supabase/config.toml` continua lá.
- **Estado do produto fantasma a manter:** `status: ACTIVE` + publicado no **Online Store** (e Point of Sale). Conferir via Admin se algum dia o checkout voltar a travar em "Sincronizando frete...".
- **🐛 BUG ABERTO descoberto nesta sessão — PIX trava o checkout:** ao selecionar PIX no `/carrinho`, o `PaymentMethodSelector` aplica o cupom `PIX5` no Shopify Cart (`applyDiscountCode`), que reduz o `subtotalAmount` do Shopify (`18.94 × 0.95 + 10.50 ≈ 28.5`). O hard-block (`Carrinho.tsx:86-90`) compara esse `shopifySubtotal` (já descontado) contra o `expectedTotal` SEM desconto (29.44) → diff ≈ R$ 0,94 → `canCheckout = false` → botão trava em "Sincronizando frete...". Voltar pra Cartão de Crédito libera. **Bug pré-existente da lógica do hard-block (R52 revisado, Sprint 4.9)** — estava mascarado porque a variant nunca entrava no Cart (o block sempre travava no caso "linha ausente", diff −10,50). Agora que a linha entra, o caso PIX ficou visível. Correção exige ajustar o `totalMatchesShopify` pra considerar desconto de cupom (comparar contra `totalAmount` quando há cupom aplicado, ou subtrair o desconto do `expectedTotal`) SEM enfraquecer a proteção contra frete-ausente. NÃO corrigido nesta sessão (fora do escopo do fix de frete).
- **Validação manual ainda pendente (usuário):** click-through real até o checkout Shopify (cobrança produtos + frete + Getnet). Spot-check de Favorites/KitLivre (mesmo helper, build passou).
- **Edge de diagnóstico `shopify-admin-diag`:** foi deployada durante a investigação e **neutralizada** (no-op, `verify_jwt=true`, retorna 410). Deletar via `supabase functions delete shopify-admin-diag`.
- **Débitos de segurança ainda abertos:** HMAC no `uber-webhook-receiver`, validação server-side de `shipping_fee_cents` (inalterados).

## O que foi feito na sessão anterior (Sprint 4.8 — TOTAL local no carrinho)

- **Bug corrigido:** o TOTAL na página `/carrinho` exibia valor errado (ex: R$ 18,00 quando subtotal R$ 18,94 + frete R$ 10,50 deveria dar R$ 29,44). Causa: `displayTotal` lia `cartCost.totalAmount` do Shopify, que não inclui o frete (variant fantasma não garantida no Cart) E já vem com o desconto do cupom aplicado (R$ 18,94 − 5% PIX5 = R$ 18,00).
- **Causa raiz conceitual:** o display estava acoplado ao Shopify Cart, quando deveria ser somatória local. O frontend já tem `subtotal` e `activeShippingFeeCents` no estado — não precisa do Shopify pra calcular o que exibe.
- **Solução:** `displayTotal = subtotal + activeShippingFeeCents / 100` (somatória local). 1 linha em `src/pages/Carrinho.tsx`. Sem desconto no display (decisão de negócio — desconto aparece só no checkout Shopify, como a UI já comunica).
- **Separação display vs cobrança:** o display virou local. A COBRANÇA do frete continua dependendo da variant fantasma no Shopify Cart (checkout nativo Shopify) — isso NÃO foi alterado, continua sendo trabalho do `<ShippingMethodSelector />` (Sprint 4.1+) e protegido pelo hard-block do `canCheckout` (R52, Sprint 4.7). O `shopifyTotal` continua existindo só para o `totalMatchesShopify`.
- **Arquivos editados:** `src/pages/Carrinho.tsx` (1 linha — `displayTotal`). 0 migrations, 0 edge functions, 0 mudanças no `cartStore`, 0 mudanças no `ShippingMethodSelector`.
- **Regra adicionada:** R53 em `requirements.md` (TOTAL local).
- **Documentação atualizada:** `fluxo-carrinho-checkout.md` (regra + gotcha sobre display vs cobrança).

### Notas para a próxima sessão

- **Display ≠ cobrança (importante):** o `displayTotal` é puramente visual e local. A cobrança real acontece no checkout Shopify, que depende da variant fantasma estar no Cart + descontos configurados no Shopify Admin. Não confundir: mexer no `displayTotal` não muda o que a Shopify cobra, e mexer na variant fantasma não muda o que a página exibe.
- **Por que o desconto não aparece no display:** decisão de negócio (Sprint 4.8). A UI já comunica "Descontos aplicados no checkout Shopify". Se no futuro quiserem mostrar o desconto na página também, dá pra calcular `cartCost.subtotalAmount - cartCost.totalAmount` e subtrair do display — mas isso foi explicitamente descartado nessa sprint.
- **O custom checkout com Getnet (planejado) muda esse jogo:** quando o checkout sair do Shopify e for próprio (Getnet), tanto o display quanto a cobrança passam a ser controlados pelo frontend/backend Jilo. Aí a variant fantasma deixa de ser necessária e o `displayTotal` local vira a fonte de verdade tanto pra exibição quanto pra cobrança. Reavaliar toda essa arquitetura quando o custom checkout entrar no roadmap.

## O que foi feito na sessão anterior (Sprint 4.7 — OAuth Client Credentials)

- **Bug raiz corrigido:** o `SHOPIFY_ADMIN_ACCESS_TOKEN` estático estava expirado/inválido em produção (HTTP 401 "Invalid API key or access token"). A Shopify migrou pro Dev Dashboard novo (Dec 2025) e deprecou a entrega direta de `shpat_` permanente. Agora, o `shpat_` é gerado dinamicamente via OAuth 2.0 Client Credentials Grant, e expira em 24h.
- **Sintoma na produção:** edge `update-shipping-variant-price` retornava 502 em 100% das chamadas. Variant fantasma de frete nunca entrava no Shopify Cart. TOTAL no `/carrinho` exibia só subtotal (sem somar frete). Em paralelo, `shopify-customer-sync` também falhava silenciosamente — clientes novos não sincronizavam no Shopify.
- **Solução (3 tracks paralelas + docs):**
  - **Track A — Backend OAuth (4 prompts sequenciais):**
    - Migration nova: `shopify_admin_tokens` (cache de `shpat_` com TTL, RLS bloqueada, service_role-only)
    - Helper compartilhado: `supabase/functions/_shared/shopify-admin-auth.ts` (Client Credentials Grant + read/write cache + force refresh em 401)
    - Refatorada `update-shipping-variant-price` para usar o helper (com retry automático em 401)
    - Refatorada `shopify-customer-sync` para usar o helper (mesmo padrão)
  - **Track B — Frontend hard-block (1 prompt):**
    - `canCheckout` em `src/pages/Carrinho.tsx` agora valida `Math.abs(shopifyTotal - (subtotal + activeShippingFeeCents/100)) < 0.01`
    - Botão exibe "Sincronizando frete..." e fica disabled em discrepância
    - `console.warn` defensivo com payload pra diagnóstico
  - **Track C — Operacional (manual):**
    - Rotacionado client_secret no Dev Dashboard
    - Cadastrados `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET` nos Edge Function Secrets
    - Removido secret antigo `SHOPIFY_ADMIN_ACCESS_TOKEN` após validação em produção
- **Arquivos editados:**
  - Migration: `supabase/migrations/<timestamp>_shopify_admin_tokens.sql` (criado)
  - `supabase/functions/_shared/shopify-admin-auth.ts` (criado)
  - `supabase/functions/update-shipping-variant-price/index.ts` (refatorado)
  - `supabase/functions/shopify-customer-sync/index.ts` (refatorado)
  - `src/pages/Carrinho.tsx` (canCheckout + diagnóstico defensivo)
- **NÃO foi tocada:** `shopify-webhook-receiver` (só usa HMAC, não chama Admin API), as 3 edges Uber (não chamam Admin API).
- **Regras adicionadas:** R51 (OAuth Client Credentials para Admin API), R52 (hard-block canCheckout) em `requirements.md`.
- **Documentação atualizada:** `fluxo-uber-direct.md` (5 gotchas novos sobre auth + cache + retry), `fluxo-shopify-sync.md` (nota sobre nova autenticação), `fluxo-carrinho-checkout.md` (regra + gotcha sobre hard-block).

### Pendências novas (Sprint 4.7)

- **Validação manual obrigatória pós-deploy:**
  - Confirmar no SQL Editor que `shopify_admin_tokens` tem 1 row com `expires_at ~24h no futuro` após primeira chamada.
  - Conferir no Shopify Admin que cart ativo tem 1 linha "Frete Uber Direct" com preço atualizado.
  - Confirmar que `/carrinho` exibe TOTAL = subtotal + frete (R$ 29,44 no cenário de teste).
  - Console sem warnings `[Carrinho] Discrepância detectada` em fluxo normal.
- **Limpeza pós-validação:** após confirmar Track A funcionando em produção (24h+), DELETAR o secret `SHOPIFY_ADMIN_ACCESS_TOKEN` dos Edge Function Secrets (Track C, Passo 5). Redeploy todas as edges.
- **Débito de operação:** documentar em runbook (Notion ou similar) o procedimento de rotação periódica do `client_secret` (recomendado a cada 6 meses). A rotação invalida o token cached imediatamente — próximo `getShopifyAdminToken()` faz refresh automático.

### Notas para a próxima sessão

- **Lição arquitetural:** secrets de longo prazo são frágeis. Sprint 4.7 substituiu um secret estático que silenciosamente expirou e travou 2 features em produção. Sempre que possível, usar OAuth ou outro flow com refresh automático.
- **Padrão a seguir em features futuras envolvendo Shopify Admin:** sempre importar `getShopifyAdminToken()` do helper compartilhado. NUNCA ler `SHOPIFY_ADMIN_ACCESS_TOKEN` direto do env (esse secret nem existe mais). Se aparecer code review com `Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN")` em qualquer edge nova, rejeitar.
- **Token `atkn_` é separado:** o "Token de automação de app" do Dev Dashboard (`atkn_xxx`) é exclusivo pra CI/CD via `shopify app deploy`. NÃO é Admin API token. Se aparecer tentativa de usar em chamadas REST/GraphQL, vai falhar 401.
- **Webhook receiver continua usando `SHOPIFY_WEBHOOK_SECRET`** (que é o mesmo `client_secret` usado pra HMAC). Esse secret NÃO mudou — continua sendo lido direto do env porque é usado pra signature, não auth. Se rotacionar o client_secret no Dev Dashboard, atualizar `SHOPIFY_WEBHOOK_SECRET` no Supabase em PARALELO com `SHOPIFY_CLIENT_SECRET`.
- **Débitos de segurança Sprint 4.1 ainda abertos:** HMAC no `uber-webhook-receiver`, validação server-side de `shipping_fee_cents`. Sprint 4.7 não mitiga esses débitos — mas com Sprint 4.7 mergeada, o `shipping_fee_cents` no webhook `orders/paid` agora reflete o valor REAL cobrado (porque a variant fantasma entra no cart de verdade). Antes, esse campo vinha frequentemente como 0 pelo bug raiz.
- **Próxima ação no `state.md`:** considerar abrir Sprint 5 com foco nos débitos de segurança restantes (HMAC Uber webhook + server-side validation `shipping_fee_cents`) + integração Bling ERP.

## O que foi feito na sessão anterior (Sprint 4.6 — Fix regressão de re-render)

- **Bug corrigido:** após Sprint 4.5, o TOTAL exibido no `/carrinho` deixou de somar o frete. Sintoma: subtotal R$ 18,94 + frete R$ 10,50 mostrava TOTAL = R$ 18,94 (sem somar). A linha "Frete R$ 10,50" aparecia na UI, mas não refletia no total nem no Shopify Cart.
- **Causa raiz:** ciclo de re-render no `Carrinho.tsx` fazia o `useEffect` de sincronização da variant fantasma no `<ShippingMethodSelector />` cancelar seu próprio `setTimeout(sync, 300)` repetidamente. A variant fantasma nunca era adicionada ao Shopify Cart. Como `displayTotal = cartCost.totalAmount` (Shopify), o valor refletia só os itens normais.
- **Por que a Sprint 4.5 piorou:** o REPLACE atômico introduzido em 4.5 faz 2 chamadas Shopify em série (`removeLineFromShopifyCart` + `addLineToShopifyCart`), aumentando a janela de execução do `sync()`. Antes, o `sync()` era mais rápido (1 chamada) e às vezes conseguia completar entre cancellations. Após 4.5, sempre era cancelado antes de completar.
- **Cadeia exata do bug:**
  1. `DeliveryAddressSelector.useEffect` chamava `onResult(buildResultFromAddress(selected))` — objeto novo a cada render.
  2. `Carrinho.tsx` fazia `setDeliveryCheck(novoObjeto)` → re-render.
  3. `<ShippingMethodSelector deliveryCheck={novoObjeto}>` re-renderizava.
  4. Dentro do componente, `cepParams` era objeto literal novo a cada render.
  5. O `useEffect` de sync tinha `cepParams` E `deliveryCheck` nas deps → identidade muda → re-roda.
  6. Cleanup `clearTimeout(timer)` cancelava antes dos 300ms → `sync()` nunca executava.
- **Solução (defesa em profundidade, 2 camadas):**
  - **Camada 1 — produtor (`DeliveryAddressSelector.tsx`):** memoizar `CepValidationResult` derivado do endereço selecionado via `useMemo` com chaves primitivas (id, cep, city, state, street, number, complement, neighborhood). Substituído também o useEffect que reporta pro pai pra consumir o memo em vez de chamar `buildResultFromAddress` inline.
  - **Camada 2 — consumidor (`ShippingMethodSelector.tsx`):** memoizar `cepParams` interno via `useMemo` com chaves primitivas do `deliveryCheck.cepInfo`. Adicionado logging defensivo: contador `cancelCountRef` dispara `console.warn` se ≥ 5 cancellations consecutivas sem sync completar. Em DEV, warning adicional quando effect re-roda sem mudança de deps primitivas.
- **Arquivos editados:** `src/components/DeliveryAddressSelector.tsx`, `src/components/ShippingMethodSelector.tsx`. 0 migrations, 0 edge functions, 0 mudanças em `Carrinho.tsx`, 0 mudanças no `cartStore`.
- **Regras novas:** Nenhuma em `requirements.md`. Fix arquitetural sem alteração de regra de negócio.
- **Documentação atualizada:** `fluxo-uber-direct.md` (3 gotchas novos), `fluxo-carrinho-checkout.md` (1 gotcha novo).

### Pendências novas (Sprint 4.6)

- **Validação manual obrigatória pós-deploy:**
  - Abrir `/carrinho` com 1 marmita + endereço SJC válido. Confirmar que TOTAL = subtotal + frete (ex: R$ 18,94 + R$ 10,50 = R$ 29,44 exato).
  - Conferir no Shopify Admin → Active carts que existe exatamente 1 linha de "Frete Uber Direct" com o preço correto.
  - Abrir Console do navegador e confirmar ausência de warning "Effect re-render loop detectado".
- **Cenários de regressão a testar manualmente:**
  - Subir cart pra 7+ marmitas → variant fantasma sai do cart, TOTAL = subtotal sem frete (correto, frete grátis).
  - Voltar pra 6 marmitas → variant fantasma volta, TOTAL = subtotal + frete novo.
  - Trocar endereço (SJC → outro SJC) → variant fantasma re-cotada, TOTAL atualiza com o novo frete.
  - Trocar endereço (SJC → fora SJC) → variant fantasma sai do cart, mensagem "Não entregamos" no `<ShippingMethodSelector />`.
  - Reload da página com cart de 6 marmitas + endereço SJC → variant fantasma é re-adicionada automaticamente pelo effect de sync no mount.

### Notas para a próxima sessão

- **Lição aprendida (importante):** quando um `useEffect` tem objeto literal nas deps, esse objeto precisa ser memoizado UPSTREAM (no produtor) E DOWNSTREAM (no consumidor onde está sendo derivado novamente). Se memoizar só num lado, vaza pelo outro. Sprint 4.5 + 4.6 ilustram essa lição: 4.5 introduziu o REPLACE atômico assumindo identidade referencial estável (que não existia), 4.6 corrigiu fechando a cadeia.
- **Padrão a seguir em features futuras envolvendo `deliveryCheck`:** se aparecer um terceiro consumer do `CepValidationResult` (ex: componente de cálculo de prazo de entrega, badge de cobertura no Header, etc), ele DEVE memoizar internamente quaisquer derivações antes de usar em deps de useEffect. O padrão está documentado em `fluxo-carrinho-checkout.md` gotcha novo.
- **Logging defensivo é canário em produção:** o warning "Effect re-render loop detectado" foi projetado pra disparar APENAS em regressões reais (5 cancellations consecutivas sem sync completar é cenário anormal). Se aparecer em logs de produção, investigar imediatamente — provável regressão de memoização similar.
- **Débitos de segurança da Sprint 4.1 ainda abertos:** HMAC no `uber-webhook-receiver`, validação server-side de `shipping_fee_cents`. Fix de 4.6 não mitiga (apenas garante que cliente legítimo seja cobrado corretamente).
- **Próxima ação no `state.md`:** se as 5 sessões de fix (4.1, 4.2, 4.3, 4.4, 4.5, 4.6) estiverem completas e o cart estiver estável em produção, considerar fechar Sprint 4 e abrir Sprint 5 com foco nos débitos de segurança + integração Bling ERP.

## O que foi feito na sessão anterior (Sprint 4.5 — Fix bug do frete duplicado)

- **Bug corrigido:** o total exibido no `/carrinho` somava o frete múltiplas vezes (sintoma reportado: subtotal R$ 18,94 + frete R$ 10,50 deveria dar R$ 29,44, mas mostrava R$ 36,76 — diferença de R$ 7,32, indicando 2 linhas da variant fantasma no Shopify Cart com cotações diferentes).
- **Causa raiz:** `cartStore.addItem` tratava a variant fantasma como item normal e somava `quantity` no branch `existingItem`. Combinado com cart hidratado do `localStorage` em estado bugado de sessão anterior, gerava múltiplas linhas no Shopify Cart com preços de cotações distintas. O `displayTotal` exibido vem do `cartCost.totalAmount` do Shopify (fonte da verdade), por isso o número errado refletia direto na UI.
- **Solução (defesa em profundidade, 2 camadas):**
  - **Camada 1 — store:** `cartStore.addItem` detecta `isShippingVariant(variantId)` e, se a variant fantasma já existe, faz REPLACE atômico (`removeLineFromShopifyCart` + `addLineToShopifyCart`) em vez de somar quantity. Early return impede o fluxo normal de executar em sequência.
  - **Camada 2 — componente:** `<ShippingMethodSelector />` ganhou effect de cleanup defensivo no mount (one-shot, guard via `useState`) que detecta variant fantasma com `quantity > 1` herdada do localStorage e remove antes do effect de sincronização rodar. Simplificou também o effect de sync — não precisa mais do bloco condicional `if (latestShippingItem) await removeItem(...)`, porque o `addItem` agora faz REPLACE atômico internamente.
- **Arquivos editados:** `src/stores/cartStore.ts` (addItem refatorado), `src/components/ShippingMethodSelector.tsx` (cleanup + sync simplificado). 0 migrations, 0 edge functions.
- **Regras adicionadas:** R50 em `requirements.md` (variant fantasma é singleton).
- **Documentação atualizada:** `fluxo-uber-direct.md` (3 gotchas novos + referência R50), `fluxo-carrinho-checkout.md` (regra 5 expandida + 1 gotcha novo).

### Pendências novas (Sprint 4.5)

- **Validação manual obrigatória pós-deploy:** abrir `/carrinho` com 1 marmita + endereço SJC válido, conferir no Shopify Admin → Active carts que existe apenas UMA linha de "Frete Uber Direct", e confirmar que TOTAL no resumo = subtotal + frete (sem diferença).
- **Cenários de regressão a testar manualmente:**
  - Adicionar 1 marmita → cart cria variant fantasma com cotação X
  - Trocar endereço → cotação re-cota com valor Y → confirmar que cart tem apenas 1 linha com valor Y (não 2 com X+Y)
  - Subir pra 7 marmitas → variant fantasma é removida → cart tem 0 linhas de frete
  - Voltar pra 6 marmitas → variant fantasma volta com 1 única linha
  - Recarregar a página com cart em qualquer estado → cleanup defensivo no mount não deve causar comportamento visível ao usuário

### Notas para a próxima sessão

- O `<ShippingMethodSelector />` agora confia 100% no `cartStore.addItem` para o singleton da variant fantasma. Se alguém mexer no `addItem` esquecendo da regra R50, o componente NÃO vai mais compensar — o cleanup defensivo só pega o caso de localStorage bugado, não regressões do próprio store.
- O cleanup defensivo é one-shot (guard `didCleanupOnMount`) — depois do primeiro mount da sessão, ele não roda mais. Isso é proposital pra não interferir com o flow normal do effect de sync.
- Os débitos de segurança da Sprint 4.1 (HMAC no `uber-webhook-receiver`, validação server-side de `shipping_fee_cents`) continuam abertos. O fix dessa sprint NÃO mitiga esses débitos — apenas evita que o cliente legítimo seja cobrado errado. Cliente malicioso ainda pode burlar via console zerando preço da variant.

## O que foi feito na sessão anterior (Sprint 4.4 — Cupom PIX condicional)

- **Bug corrigido:** cupom PIX falhava silenciosamente em carrinhos ≥7 marmitas porque `PIX5` está configurado como NÃO combinável no Shopify Admin e conflitava com os Automatic Discounts dos Kits (7/14/21/28).
- **Solução:** introduzir cupom novo `PIX3` (3% off, combinável com descontos de produto), aplicado quando carrinho ≥7. PIX5 mantido inalterado para <7.
- Cupom `PIX3` criado manualmente no Shopify Admin (paridade de 26 produtos elegíveis com PIX5).
- `src/components/PaymentMethodSelector.tsx` refatorado:
  - Helper `getPixCouponForCart(totalNonShippingItems)` retorna `{ code, percent }` condicional ao threshold (`SHIPPING_FREE_THRESHOLD`)
  - Nova prop `totalNonShippingItems` (passada pelo Carrinho.tsx)
  - Badge dinâmico ("PIX 3% off" ou "PIX 5% off")
  - `useEffect` de reatividade: troca cupom automaticamente quando cliente cruza threshold com PIX selecionado
  - `console.error` com payload do cart sempre que Shopify retorna `applicable=false` inesperado
- `src/pages/Carrinho.tsx`: passa `totalNonShippingItems={totalNonShippingItems}` ao `<PaymentMethodSelector />` (1 linha)
- R19 reescrita em `requirements.md` documentando a regra condicional + diagnóstico
- `fluxo-carrinho-checkout.md` regra 9 substituída + 3 gotchas adicionados
- 1 componente editado, 1 página editada (1 linha), 0 migrations, 0 edge functions

### Pendências novas (Sprint 4.4)

- **Débito técnico (UX):** `PixCallout.tsx` ainda diz estaticamente "PIX 5% off" em Product/CartDrawer/Kit/KitLivre. Para clientes que pretendem fechar ≥7 marmitas, isso é uma inconsistência educativa (vitrine promete 5%, carrinho aplica 3%). Sprint futura: tornar o callout sensível à quantidade do carrinho ou exibir "PIX 5% ou 3% off conforme quantidade".
- **Validação de produção:** após deploy, testar fluxo end-to-end real em todas as faixas de quantidade (1, 6, 7, 13, 14, 20, 21, 27, 28+) e confirmar que o Shopify Admin Orders mostra cada cupom corretamente aplicado.

### Notas para a próxima sessão

- Se `PIX5` ou `PIX3` forem desativados ou tiverem combinabilidade alterada no Shopify Admin, o frontend precisa ser ajustado em paralelo. O par é coreografado.
- O threshold de troca de cupom (`SHIPPING_FREE_THRESHOLD = 7`) é COMPARTILHADO com: regra de frete Uber Direct (R34), Kits do Shopify (Kit 7/14/21/28). Qualquer mudança no número 7 impacta esses TRÊS sistemas + a regra PIX.
- O diagnóstico `console.error` com payload do cart vai ajudar a detectar futuros desalinhamentos entre Shopify Admin e código (ex: alguém renomear o cupom, mexer em combinabilidade, expirar a data).

## O que foi feito na sessão anterior (Sprint 4.3 — Seletor de endereço no carrinho)

- Criado componente `src/components/DeliveryAddressSelector.tsx` (4 estados: guest, loading, vazio, lista)
- Adicionado helper síncrono `isAreaDeliverable(uf, city)` em `src/lib/cepValidator.ts`
- Substituído `<CepChecker />` por `<DeliveryAddressSelector />` no `src/pages/Carrinho.tsx`
- Adicionado cart attribute `selected_address_id` no `handleCheckout` (2 ocorrências — handler direto + useEffect pós-login)
- Reusados sem mudança: `<AuthDialog />`, `<AddressFormDialog />`, `useAddresses()`, `<ShippingMethodSelector />`
- 1 componente criado, 2 arquivos editados, 0 migrations
- Regras adicionadas: R46, R47, R48, R49 em `requirements.md`

### Pendências novas (Sprint 4.3)
- Débito técnico: migrar dados legados de `profiles.address/cep/...` para a tabela `addresses` via script SQL idempotente (fora do escopo desta sprint)

### Notas para a próxima sessão
- Se aparecer pedido de "remover CepChecker do codebase", verificar antes onde mais ele é usado — neste momento só `/carrinho` consumia, e a regra R49 explicita que o componente foi preservado.
- A whitelist `DELIVERY_AREAS` continua em `cepValidator.ts`. Expandir cobertura = editar essa constante (sem touch em DB).
- O cart attribute `selected_address_id` pode ser consumido pelo `shopify-webhook-receiver` em sprint futura se quisermos cross-check do endereço do pedido contra o cadastrado no Supabase.

## O que foi feito na sessão anterior (Sprint 4.2 — Return URL no checkout Shopify)

- `src/config/site.ts` criado: exporta `SITE_URL` (com fallback `https://jilomarmitas.com` e override via `VITE_SITE_URL`) e `SITE_HOSTNAME`. Fonte única de URL canônica no frontend (equivalente em runtime do `SITE_URL` já usado pelo gerador SEO em build time).
- `src/lib/shopify.ts` ganhou helper `appendReturnToCheckoutUrl(checkoutUrl, returnTo?)` que adiciona `?return_to=<SITE_URL>` ao checkout antes do redirect (fail-safe via try/catch).
- `src/pages/Carrinho.tsx` `handleCheckout` (e seu useEffect espelho de auto-checkout pós-login) agora gravam cart attribute `return_url` junto com `delivery_method` e `uber_quote_id`, e o checkout é aberto com `appendReturnToCheckoutUrl`.
- `src/pages/Product.tsx` `handleBuyNow` recebeu o mesmo tratamento (cart attribute + helper).
- R45 adicionada ao `requirements.md` documentando o padrão.
- `fluxo-carrinho-checkout.md` atualizado (regra 13, nova regra 18, gotchas, tabela de arquivos).
- Pré-requisito complementar (manual no Shopify Admin): configurar `checkout.jilomarmitas.com` como domínio primário em Settings → Domains.
- O `CartDrawer.tsx` não precisou de mudança (não vai direto pro checkout — navega `/carrinho`).
- Edge Functions não precisaram de mudança: `note_attributes` propagam pro webhook `orders/paid` automaticamente; o atributo `return_url` aparece como `note_attribute` no pedido sem código novo.
- ⚠️ Importante: A solução originalmente cogitada de injetar JavaScript via "Additional Scripts" na Order Status Page foi descartada. A Shopify descontinuou essa funcionalidade em 28/08/2025 (read-only desde então; auto-upgrade dos não-Plus iniciando jan/2026). Customizações JS na thank-you page hoje exigem Checkout UI Extensions (apps Shopify), o que está fora do escopo deste Sprint. A combinação código + domínio primário é suficiente.

## O que foi feito na sessão anterior (Sprint 4.1 — Frete Uber Direct)

- Migration `20260429000000_orders_uber_delivery_fields.sql` adicionando 6 campos a `orders` (já existia, agora documentada)
- Script `scripts/setup-shipping-variant.ts` (já existia) cria produto fantasma "Frete Uber Direct" no Shopify (REST API, idempotente)
- Adicionado scope `write_products` ao Custom App existente — **NÃO foi necessário**: validação em 2026-04-29 confirmou que o app já tinha 178 scopes ativos, incluindo todos os necessários para a feature. Pulamos o passo de reinstalação.
- 4 Edge Functions novas: `uber-quote`, `update-shipping-variant-price` (GraphQL), `uber-create-delivery`, `uber-webhook-receiver`
- `shopify-webhook-receiver` estendido: handler `orders/paid` popula campos Uber e dispara delivery fire-and-forget
- `src/config/shipping.ts` + `supabase/functions/_shared/shipping-constants.ts` com `SHIPPING_FREE_THRESHOLD = 7`
- `src/lib/uberDirect.ts` cliente das edges
- `src/hooks/useNonShippingTotalItems.ts` + `useVisibleCartItems` (selectors)
- `src/hooks/useShippingQuote.ts` (TanStack Query, staleTime 14min)
- `src/lib/shopify.ts` ganhou mutation `cartAttributesUpdate` + helper `setCartAttributes`
- `src/components/ShippingMethodSelector.tsx` novo componente
- `Carrinho.tsx` integrado (`<ShippingMethodSelector />` no resumo, `handleCheckout` async grava cart attributes)
- `CartDrawer.tsx` integrado (mensagem condicional de frete)
- `cepValidator.ts` removida menção a "Frete grátis" da mensagem de CEP atendido
- R34 a R44 adicionadas em `requirements.md`. R16 e R17 marcadas como atualizadas.
- `fluxo-uber-direct.md` criado documentando todo o fluxo
- `fluxo-carrinho-checkout.md`, `fluxo-shopify-sync.md` atualizados

## Histórico de sprints
- **Sprint 1 (2026-04-16)** — Área do cliente completa (auth, perfil, pedidos, endereços, timeline)
- **Sprint 2 (2026-04-16)** — Shopify customer sync + checkout gating
- **Sprint 3 (2026-04-22)** — SEO tradicional + GEO (llms.txt) com geração em build time + correção do domínio canônico
- **Sprint 3.5 (2026-04-22)** — Correção do shell HTML: meta tags estáticas completas, favicon válido, og-image própria, robots.txt regenerado
- **Sprint 4.1 (2026-04-29)** — Frete Uber Direct condicional
- **Sprint 4.2 (2026-05-11)** — Return URL no checkout Shopify (`return_to` querystring + cart attribute `return_url`) e centralização da constante `SITE_URL` em `src/config/site.ts`
- **Sprint 4.3 (2026-05-18)** — Seletor de endereço no carrinho (`<DeliveryAddressSelector />` substituindo `<CepChecker />`, cart attribute `selected_address_id`)
- **Sprint 4.4 (2026-05-20)** — Cupom PIX condicional por quantidade (PIX5 < 7 marmitas, PIX3 ≥ 7)
- **Sprint 4.5 (2026-05-27)** — Fix variant fantasma duplicada no cart (REPLACE atômico no `cartStore` + cleanup defensivo no `<ShippingMethodSelector />`)
- **Sprint 4.6 (2026-05-27)** — Fix regressão Sprint 4.5: variant fantasma não entrava no cart (memoização de `CepValidationResult` no produtor + `cepParams` no consumidor + logging defensivo)
- **Sprint 4.7 (2026-05-27)** — Refatoração OAuth Client Credentials Grant para Shopify Admin API (tabela `shopify_admin_tokens` + helper `_shared/shopify-admin-auth.ts`) + hard-block do `canCheckout` validando estado real do Shopify Cart
- **Sprint 4.8 (2026-05-28)** — TOTAL da página de carrinho via somatória local (`subtotal + frete`), desacoplando display da cobrança Shopify
- **Sprint 5.0 (2026-06-01)** — Causa raiz resolvida: produto fantasma estava publicado só no Point of Sale, não no Online Store; fix = publicar no Online Store + `status: ACTIVE` + filtro `-tag:__internal_shipping` nas queries de catálogo. UNLISTED foi testado e NÃO é exposto pela Storefront desta loja. Validação pós-add (R55) mantida como defesa.
- **Sprint 5.1 (2026-06-03 / 06-15, consolidada no merge)** — Kit em múltiplos de 7 com UX acionável (R56), frete grátis blindado na transição ≥7 (R58), cupom PIX efêmero reconciliado no load (R57) e hard-block por presença da linha de frete `shopifyHasShippingLine` (R59, substitui o `totalMatchesShopify` — resolve o bug do PIX travando o checkout). Criados `kitQuantity.ts`, `pixCoupons.ts`, `KitQuantityNotice.tsx`. Em paralelo (branch `fi`): desconto de kit visível no carrinho via agregação de `line.discountAllocations` + TOTAL com desconto + base do PIX descontada (R60). 0 migrations, 0 edge functions.


## Pendências

### Carryover Sprint 3.5
- Submeter `sitemap.xml` no Google Search Console e Bing Webmaster Tools após o go-live
- Request Indexing no GSC para home, /cardapio e /colecao/* após deploy do Sprint 3.5
- Preencher `<meta name="google-site-verification" content="..." />` no index.html
- Substituir og-image.jpg provisória se foi usado fallback
- Testar ingestão do `llms-full.txt` em conversas com ChatGPT, Claude e Perplexity

### Carryover Sprint 1/2
- Débito técnico: testar fluxo end-to-end de signup → confirmação de email → sync Shopify
- Débito técnico: validação de CPF com máscara + checksum
- Débito técnico: integração ViaCEP no AddressFormDialog
- Débito de segurança: migrar anon key do Supabase para `.env`

### Sprint 4.1 — débitos novos
- **Débito de segurança CRÍTICO:** webhook `uber-webhook-receiver` NÃO valida HMAC ainda — implementar antes do go-live
- **Débito de segurança:** validação server-side de `shipping_fee_cents` (cliente pode burlar via console zerando preço da variant antes do `cartLinesAdd`). Mitigação: comparar com cotação Uber re-confirmada no webhook `orders/paid`
- **Débito de produto:** UI admin para gerenciar orders com `delivery_status='jilo_pending'` (≥ 7 marmitas, despache manual)
- **Débito de produto:** Tracking link Uber (`uber_tracking_url`) na área do cliente em `/conta/pedidos/:id`
- Testar end-to-end em sandbox Uber Direct antes de switch para produção (`UBER_API_BASE`)
- Validar lat/lng do pickup Jilo com endereço real da cozinha

### Sprint 4 (resto, ainda não tocado)
- Estender `shopify-webhook-receiver` para popular `order_items` (tabela normalizada) — hoje `line_items` jsonb continua sendo usado
- Garantir que `orders.user_id` seja preenchido via lookup por email no webhook
- Webhook `customers/update` para refletir mudanças do Shopify no Supabase
- Integração Bling ERP

## Próximos passos planejados

Sprint 4.3 — endurecimento Uber (renomeado do 4.2 original):
1. Validação HMAC no `uber-webhook-receiver`
2. Validação server-side de `shipping_fee_cents` no `shopify-webhook-receiver`
3. Painel admin para `jilo_pending` orders (UI mínima em `/conta/admin` ou similar)

Sprint 4 (resto):
1. Migrar webhook receiver de `line_items` jsonb para `order_items` normalizado
2. Lookup de `user_id` por email
3. Webhook `customers/update`
4. Integração Bling ERP

## Notas para a próxima sessão
- **IMPORTANTE — auth Shopify Admin mudou (Sprint 4.7):** o secret `SHOPIFY_ADMIN_ACCESS_TOKEN` não existe mais. Toda chamada à Admin API passa por `getShopifyAdminToken()` em `_shared/shopify-admin-auth.ts`. Secrets que vivem nas Edge Functions: `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET`. Ver R51 em `requirements.md`.
- Domínio canônico do site é `https://jilomarmitas.com` — usar sempre essa URL em qualquer referência a links absolutos
- Ao adicionar novo prato ao cardápio: rodar `npm run seed` depois `npm run seo` e comitar os arquivos gerados
- Ao trocar logo ou og-image: substituir arquivos em `public/`, commitar, publicar, e forçar Request Indexing no GSC
- `llms.txt` e `llms-full.txt` são padrões emergentes — a spec pode evoluir. Monitorar llmstxt.org
- Se em qualquer momento surgir necessidade de adicionar subdomínio (ex: blog.jilomarmitas.com), criar sitemap separado e referenciá-lo no robots.txt
- Meta tags globais continuam no `index.html` estático (R31). Se o projeto crescer e precisar de meta tags por rota (ex.: SEO por produto na página `/produto/:handle`), adicionar `react-helmet-async` sem remover o que está no shell — o shell é fallback para quem não roda JS
- **Frete Uber Direct está em produção (Sprint 4.1)** — qualquer mudança no threshold de 7 marmitas exige editar `src/config/shipping.ts` E `supabase/functions/_shared/shipping-constants.ts` (manter sincronizados)
- O produto fantasma "Frete Uber Direct" no Shopify Admin tem `status: draft` propositalmente — NÃO publicar
- O Custom App Shopify usa um token de "full access" (178 scopes, incluindo `write_products`). Se for revogado/rotacionado, substituto precisa manter pelo menos `write_customers`, `write_products`, `read_orders`, `write_orders`. Atualizar em DOIS lugares: `.env` local (`SHOPIFY_ADMIN_TOKEN`) e Edge Function Secrets (`SHOPIFY_ADMIN_ACCESS_TOKEN`) — nomes diferentes, mesmo valor. (Valor literal do token NÃO fica documentado aqui — vive apenas nos secrets.)
- Se Uber lançar API nova ou mudar payload de webhook, ajustar `UBER_STATUS_MAP` em `uber-webhook-receiver/index.ts`
- Edges chamadas server-to-server (`uber-create-delivery`) são deployadas com `--no-verify-jwt` e validam o `Authorization: Bearer <service_role>` manualmente
- **URL de auth da Uber é `auth.uber.com/oauth/v2/token`** (validado contra doc oficial em 2026-04-29). Scope único: `eats.deliveries`. Token vale 30 dias.
- **Customer ID Uber:** o que aparece no painel como "ID do usuário" (formato UUID) é o que vai nas URLs `/v1/customers/{customer_id}/...`. NÃO confundir com `client_id` (OAuth)
- **Débito de operação:** o `client_secret` cadastrado precisa ser confirmado contra o painel Uber Direct. Se foi rotacionado depois do compartilhamento inicial, atualizar o secret no Supabase
- Antes do go-live, validar se as credenciais Uber são de sandbox ou produção. No painel: aviso azul "Test mode" no topo = sandbox. Sem aviso = produção.
- **Sprint 4.2:** Após deploy do código, confirmar no Shopify Admin: `checkout.jilomarmitas.com` configurado como domínio primário e SSL ativo. Esse passo manual é complementar ao código — sem ele, o `?return_to=` pode não ser honrado em todos os flows.
- `VITE_SITE_URL` pode ser usado pra apontar pra ambientes não-produção (staging/preview) sem mexer no código — coloca no `.env` local ou nas vars do hosting. Sem override, fallback é sempre `https://jilomarmitas.com`.
- **Sobre customização da thank-you page Shopify:** Se em algum momento precisarmos sobrescrever o botão "Continue Shopping" ou injetar lógica na thank-you page (pixel custom, mensagem personalizada), a única via válida hoje é construir uma Checkout UI Extension como app Shopify dedicada — Additional Scripts foi descontinuado. Estimativa: 2–3 dias de dev. Priorizar somente se houver demanda concreta.
