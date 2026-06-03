# Estado do projeto Jilo

## Última atualização
2026-06-03 (Sprint 5.1 — Venda em múltiplos de 7)

## O que foi feito na última sessão (Sprint 5.1 — Venda em múltiplos de 7)

- Regra R56: a partir de 7 marmitas, só múltiplos de 7 (logística da sacola Jiló). 1–6 segue avulso.
- Soft-block: gate único no `canCheckout` do `Carrinho.tsx` (4ª condição). Nenhum ponto de adição rejeita.
- Criados: `src/config/kitQuantity.ts` (`KIT_STEP = SHIPPING_FREE_THRESHOLD`, `isValidKitQuantity`, `getKitQuantityGuidance`), `src/components/KitQuantityNotice.tsx` (copy voz Jiló da fase inicial).
- Editados: `Carrinho.tsx` (`canCheckout` + aviso + label do botão), `CartDrawer.tsx` (aviso informativo), `KitLivre.tsx` (múltiplos ilimitados, removido cap de 28, lógica de próximo múltiplo genérica).
- 0 migrations, 0 edge functions. Loja Shopify confirmada íntegra (26 marmitas, variant fantasma ACTIVE, kits 7/14/21/28 >=-based com teto 25% em 28+).

### Pendências / Notas

- Validação manual: testar faixas 6, 7, 8, 13, 14, 21, 28, 35 no `/carrinho` e no KitLivre.
- Bug aberto do PIX no hard-block (pré-existente) segue NÃO resolvido — fora do escopo desta sprint.

## O que foi feito na Ãºltima sessÃ£o (Sprint 5.0 â€” PublicaÃ§Ã£o no sales channel + status ACTIVE + filtro de catÃ¡logo)

> âš ï¸ CorreÃ§Ã£o de rumo: a hipÃ³tese inicial desta sprint (status `UNLISTED` resolve o bug) foi **testada empiricamente e refutada** via Playwright + Storefront/Admin API. O que segue Ã© o diagnÃ³stico verificado.

- **Bug raiz verificado (nÃ£o era status):** o produto fantasma "Frete Uber Direct" (`gid://shopify/Product/9213544136844`, variant `48168478769292` â€” bate com o `.env`) estava publicado **apenas no sales channel "Point of Sale"**, NÃƒO no "Online Store". O token Storefront do frontend lÃª do canal Online Store. Em Shopify, disponibilidade via Storefront = **publicaÃ§Ã£o no sales channel do token**, ortogonal ao status do produto. Por isso o `cartLinesAdd` da variant retornava erro explÃ­cito "A mercadoria â€¦ nÃ£o existe" e o `node()` retornava `null` â†’ a linha nunca entrava no Cart â†’ hard-block do checkout sempre travado em "Sincronizando frete...".
- **UNLISTED NÃƒO funciona nesta loja (refutado):** depois de publicar o produto no Online Store mantendo `status: UNLISTED`, a variant continuou retornando `node: null` na Storefront em **todas as versÃµes testadas (2025-07, 2025-10, 2025-01, unstable)** ao longo de vÃ¡rios minutos. SÃ³ ao mudar para `status: ACTIVE` (jÃ¡ publicado no Online Store) Ã© que `availableForSale: true` e `cartLinesAdd` passaram a funcionar â€” verificado de ponta a ponta no `/carrinho` (botÃ£o "Ir para o Checkout" liberou, TOTAL R$ 29,44). NOTA: nÃ£o foi feito o teste reverso limpo (ACTIVEâ†’UNLISTED apÃ³s propagaÃ§Ã£o), entÃ£o o fato verificado Ã© "UNLISTED+publicado retornou null nos nossos testes", nÃ£o "UNLISTED Ã© impossÃ­vel em qualquer cenÃ¡rio".
- **CorreÃ§Ã£o aplicada (fix completo, escolhido pelo usuÃ¡rio):**
  - **Shopify (via Admin GraphQL):** produto fantasma `publishablePublish` no Online Store + `status: ACTIVE`.
  - **CÃ³digo â€” filtro de catÃ¡logo:** como ACTIVE faz o produto aparecer em listagens (as queries `PRODUCTS_QUERY` nÃ£o filtravam a tag), foi adicionado o helper `excludeInternalShipping(query?)` em `src/lib/shopify.ts` e aplicado em TODOS os call sites de catÃ¡logo (`AllDishes`, `FullMenu`, `Favorites` (2x), `KitLivre`, `Carrinho` sugestÃµes, `Product` relacionados, `Collection`). Verificado: cardÃ¡pio voltou de 27 â†’ 26 pratos, "Frete Uber Direct" nÃ£o vaza. A filtragem visual de `__internal_shipping` no carrinho (Carrinho/CartDrawer) continua valendo.
  - **`cartStore.ts` â€” validaÃ§Ã£o pÃ³s-add (R55):** mantida como defesa em profundidade (apÃ³s `addLineToShopifyCart` com sucesso para a variant fantasma, confirma via `fetchCartFull` que a linha entrou). Ãštil pra detectar regressÃµes de publicaÃ§Ã£o/status. (Os comentÃ¡rios internos que diziam "produto Ã© unlisted" foram corrigidos pra "ACTIVE + publicado".)
- **O que NÃƒO mudou:** hard-block `canCheckout` (R52, Sprint 4.9), display local (R53), OAuth Client Credentials (R51), REPLACE atÃ´mico (R50), memoizaÃ§Ã£o (Sprint 4.6) â€” todos intactos.
- **Regras:** R54 (status ACTIVE + publicado no Online Store; UNLISTED nÃ£o serve) e R55 (validaÃ§Ã£o pÃ³s-add) em `requirements.md` â€” **reescritas** pra refletir a realidade verificada.
- **Arquivos editados:**
  - `src/lib/shopify.ts` (helper `excludeInternalShipping` + `INTERNAL_SHIPPING_TAG`)
  - `src/pages/{Carrinho,Product,Collection,KitLivre}.tsx` e `src/components/sections/{AllDishes,FullMenu,Favorites}.tsx` (filtro nas queries de catÃ¡logo)
  - `src/stores/cartStore.ts` (validaÃ§Ã£o pÃ³s-add R55, da sessÃ£o anterior)
  - Shopify: produto `9213544136844` â†’ ACTIVE + publicado no Online Store (via Admin API)

### PendÃªncias / Notas para a prÃ³xima sessÃ£o

- **âš ï¸ A edge `set-product-unlisted` estÃ¡ OBSOLETA e Ã© PERIGOSA:** ela seta `UNLISTED`, que **re-quebra o carrinho** (a variant some da Storefront). NÃƒO rodar. DecisÃ£o pendente do usuÃ¡rio: deletar a edge OU repropÃ´-la como "set ACTIVE + publishablePublish(Online Store)" â€” que Ã© o que um ambiente novo (staging) realmente precisa. A entrada em `supabase/config.toml` continua lÃ¡.
- **Estado do produto fantasma a manter:** `status: ACTIVE` + publicado no **Online Store** (e Point of Sale). Conferir via Admin se algum dia o checkout voltar a travar em "Sincronizando frete...".
- **ðŸ› BUG ABERTO descoberto nesta sessÃ£o â€” PIX trava o checkout:** ao selecionar PIX no `/carrinho`, o `PaymentMethodSelector` aplica o cupom `PIX5` no Shopify Cart (`applyDiscountCode`), que reduz o `subtotalAmount` do Shopify (`18.94 Ã— 0.95 + 10.50 â‰ˆ 28.5`). O hard-block (`Carrinho.tsx:86-90`) compara esse `shopifySubtotal` (jÃ¡ descontado) contra o `expectedTotal` SEM desconto (29.44) â†’ diff â‰ˆ R$ 0,94 â†’ `canCheckout = false` â†’ botÃ£o trava em "Sincronizando frete...". Voltar pra CartÃ£o de CrÃ©dito libera. **Bug prÃ©-existente da lÃ³gica do hard-block (R52 revisado, Sprint 4.9)** â€” estava mascarado porque a variant nunca entrava no Cart (o block sempre travava no caso "linha ausente", diff âˆ’10,50). Agora que a linha entra, o caso PIX ficou visÃ­vel. CorreÃ§Ã£o exige ajustar o `totalMatchesShopify` pra considerar desconto de cupom (comparar contra `totalAmount` quando hÃ¡ cupom aplicado, ou subtrair o desconto do `expectedTotal`) SEM enfraquecer a proteÃ§Ã£o contra frete-ausente. NÃƒO corrigido nesta sessÃ£o (fora do escopo do fix de frete).
- **ValidaÃ§Ã£o manual ainda pendente (usuÃ¡rio):** click-through real atÃ© o checkout Shopify (cobranÃ§a produtos + frete + Getnet). Spot-check de Favorites/KitLivre (mesmo helper, build passou).
- **Edge de diagnÃ³stico `shopify-admin-diag`:** foi deployada durante a investigaÃ§Ã£o e **neutralizada** (no-op, `verify_jwt=true`, retorna 410). Deletar via `supabase functions delete shopify-admin-diag`.
- **DÃ©bitos de seguranÃ§a ainda abertos:** HMAC no `uber-webhook-receiver`, validaÃ§Ã£o server-side de `shipping_fee_cents` (inalterados).

## O que foi feito na sessÃ£o anterior (Sprint 4.8 â€” TOTAL local no carrinho)

- **Bug corrigido:** o TOTAL na pÃ¡gina `/carrinho` exibia valor errado (ex: R$ 18,00 quando subtotal R$ 18,94 + frete R$ 10,50 deveria dar R$ 29,44). Causa: `displayTotal` lia `cartCost.totalAmount` do Shopify, que nÃ£o inclui o frete (variant fantasma nÃ£o garantida no Cart) E jÃ¡ vem com o desconto do cupom aplicado (R$ 18,94 âˆ’ 5% PIX5 = R$ 18,00).
- **Causa raiz conceitual:** o display estava acoplado ao Shopify Cart, quando deveria ser somatÃ³ria local. O frontend jÃ¡ tem `subtotal` e `activeShippingFeeCents` no estado â€” nÃ£o precisa do Shopify pra calcular o que exibe.
- **SoluÃ§Ã£o:** `displayTotal = subtotal + activeShippingFeeCents / 100` (somatÃ³ria local). 1 linha em `src/pages/Carrinho.tsx`. Sem desconto no display (decisÃ£o de negÃ³cio â€” desconto aparece sÃ³ no checkout Shopify, como a UI jÃ¡ comunica).
- **SeparaÃ§Ã£o display vs cobranÃ§a:** o display virou local. A COBRANÃ‡A do frete continua dependendo da variant fantasma no Shopify Cart (checkout nativo Shopify) â€” isso NÃƒO foi alterado, continua sendo trabalho do `<ShippingMethodSelector />` (Sprint 4.1+) e protegido pelo hard-block do `canCheckout` (R52, Sprint 4.7). O `shopifyTotal` continua existindo sÃ³ para o `totalMatchesShopify`.
- **Arquivos editados:** `src/pages/Carrinho.tsx` (1 linha â€” `displayTotal`). 0 migrations, 0 edge functions, 0 mudanÃ§as no `cartStore`, 0 mudanÃ§as no `ShippingMethodSelector`.
- **Regra adicionada:** R53 em `requirements.md` (TOTAL local).
- **DocumentaÃ§Ã£o atualizada:** `fluxo-carrinho-checkout.md` (regra + gotcha sobre display vs cobranÃ§a).

### Notas para a prÃ³xima sessÃ£o

- **Display â‰  cobranÃ§a (importante):** o `displayTotal` Ã© puramente visual e local. A cobranÃ§a real acontece no checkout Shopify, que depende da variant fantasma estar no Cart + descontos configurados no Shopify Admin. NÃ£o confundir: mexer no `displayTotal` nÃ£o muda o que a Shopify cobra, e mexer na variant fantasma nÃ£o muda o que a pÃ¡gina exibe.
- **Por que o desconto nÃ£o aparece no display:** decisÃ£o de negÃ³cio (Sprint 4.8). A UI jÃ¡ comunica "Descontos aplicados no checkout Shopify". Se no futuro quiserem mostrar o desconto na pÃ¡gina tambÃ©m, dÃ¡ pra calcular `cartCost.subtotalAmount - cartCost.totalAmount` e subtrair do display â€” mas isso foi explicitamente descartado nessa sprint.
- **O custom checkout com Getnet (planejado) muda esse jogo:** quando o checkout sair do Shopify e for prÃ³prio (Getnet), tanto o display quanto a cobranÃ§a passam a ser controlados pelo frontend/backend Jilo. AÃ­ a variant fantasma deixa de ser necessÃ¡ria e o `displayTotal` local vira a fonte de verdade tanto pra exibiÃ§Ã£o quanto pra cobranÃ§a. Reavaliar toda essa arquitetura quando o custom checkout entrar no roadmap.

## O que foi feito na sessÃ£o anterior (Sprint 4.7 â€” OAuth Client Credentials)

- **Bug raiz corrigido:** o `SHOPIFY_ADMIN_ACCESS_TOKEN` estÃ¡tico estava expirado/invÃ¡lido em produÃ§Ã£o (HTTP 401 "Invalid API key or access token"). A Shopify migrou pro Dev Dashboard novo (Dec 2025) e deprecou a entrega direta de `shpat_` permanente. Agora, o `shpat_` Ã© gerado dinamicamente via OAuth 2.0 Client Credentials Grant, e expira em 24h.
- **Sintoma na produÃ§Ã£o:** edge `update-shipping-variant-price` retornava 502 em 100% das chamadas. Variant fantasma de frete nunca entrava no Shopify Cart. TOTAL no `/carrinho` exibia sÃ³ subtotal (sem somar frete). Em paralelo, `shopify-customer-sync` tambÃ©m falhava silenciosamente â€” clientes novos nÃ£o sincronizavam no Shopify.
- **SoluÃ§Ã£o (3 tracks paralelas + docs):**
  - **Track A â€” Backend OAuth (4 prompts sequenciais):**
    - Migration nova: `shopify_admin_tokens` (cache de `shpat_` com TTL, RLS bloqueada, service_role-only)
    - Helper compartilhado: `supabase/functions/_shared/shopify-admin-auth.ts` (Client Credentials Grant + read/write cache + force refresh em 401)
    - Refatorada `update-shipping-variant-price` para usar o helper (com retry automÃ¡tico em 401)
    - Refatorada `shopify-customer-sync` para usar o helper (mesmo padrÃ£o)
  - **Track B â€” Frontend hard-block (1 prompt):**
    - `canCheckout` em `src/pages/Carrinho.tsx` agora valida `Math.abs(shopifyTotal - (subtotal + activeShippingFeeCents/100)) < 0.01`
    - BotÃ£o exibe "Sincronizando frete..." e fica disabled em discrepÃ¢ncia
    - `console.warn` defensivo com payload pra diagnÃ³stico
  - **Track C â€” Operacional (manual):**
    - Rotacionado client_secret no Dev Dashboard
    - Cadastrados `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET` nos Edge Function Secrets
    - Removido secret antigo `SHOPIFY_ADMIN_ACCESS_TOKEN` apÃ³s validaÃ§Ã£o em produÃ§Ã£o
- **Arquivos editados:**
  - Migration: `supabase/migrations/<timestamp>_shopify_admin_tokens.sql` (criado)
  - `supabase/functions/_shared/shopify-admin-auth.ts` (criado)
  - `supabase/functions/update-shipping-variant-price/index.ts` (refatorado)
  - `supabase/functions/shopify-customer-sync/index.ts` (refatorado)
  - `src/pages/Carrinho.tsx` (canCheckout + diagnÃ³stico defensivo)
- **NÃƒO foi tocada:** `shopify-webhook-receiver` (sÃ³ usa HMAC, nÃ£o chama Admin API), as 3 edges Uber (nÃ£o chamam Admin API).
- **Regras adicionadas:** R51 (OAuth Client Credentials para Admin API), R52 (hard-block canCheckout) em `requirements.md`.
- **DocumentaÃ§Ã£o atualizada:** `fluxo-uber-direct.md` (5 gotchas novos sobre auth + cache + retry), `fluxo-shopify-sync.md` (nota sobre nova autenticaÃ§Ã£o), `fluxo-carrinho-checkout.md` (regra + gotcha sobre hard-block).

### PendÃªncias novas (Sprint 4.7)

- **ValidaÃ§Ã£o manual obrigatÃ³ria pÃ³s-deploy:**
  - Confirmar no SQL Editor que `shopify_admin_tokens` tem 1 row com `expires_at ~24h no futuro` apÃ³s primeira chamada.
  - Conferir no Shopify Admin que cart ativo tem 1 linha "Frete Uber Direct" com preÃ§o atualizado.
  - Confirmar que `/carrinho` exibe TOTAL = subtotal + frete (R$ 29,44 no cenÃ¡rio de teste).
  - Console sem warnings `[Carrinho] DiscrepÃ¢ncia detectada` em fluxo normal.
- **Limpeza pÃ³s-validaÃ§Ã£o:** apÃ³s confirmar Track A funcionando em produÃ§Ã£o (24h+), DELETAR o secret `SHOPIFY_ADMIN_ACCESS_TOKEN` dos Edge Function Secrets (Track C, Passo 5). Redeploy todas as edges.
- **DÃ©bito de operaÃ§Ã£o:** documentar em runbook (Notion ou similar) o procedimento de rotaÃ§Ã£o periÃ³dica do `client_secret` (recomendado a cada 6 meses). A rotaÃ§Ã£o invalida o token cached imediatamente â€” prÃ³ximo `getShopifyAdminToken()` faz refresh automÃ¡tico.

### Notas para a prÃ³xima sessÃ£o

- **LiÃ§Ã£o arquitetural:** secrets de longo prazo sÃ£o frÃ¡geis. Sprint 4.7 substituiu um secret estÃ¡tico que silenciosamente expirou e travou 2 features em produÃ§Ã£o. Sempre que possÃ­vel, usar OAuth ou outro flow com refresh automÃ¡tico.
- **PadrÃ£o a seguir em features futuras envolvendo Shopify Admin:** sempre importar `getShopifyAdminToken()` do helper compartilhado. NUNCA ler `SHOPIFY_ADMIN_ACCESS_TOKEN` direto do env (esse secret nem existe mais). Se aparecer code review com `Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN")` em qualquer edge nova, rejeitar.
- **Token `atkn_` Ã© separado:** o "Token de automaÃ§Ã£o de app" do Dev Dashboard (`atkn_xxx`) Ã© exclusivo pra CI/CD via `shopify app deploy`. NÃƒO Ã© Admin API token. Se aparecer tentativa de usar em chamadas REST/GraphQL, vai falhar 401.
- **Webhook receiver continua usando `SHOPIFY_WEBHOOK_SECRET`** (que Ã© o mesmo `client_secret` usado pra HMAC). Esse secret NÃƒO mudou â€” continua sendo lido direto do env porque Ã© usado pra signature, nÃ£o auth. Se rotacionar o client_secret no Dev Dashboard, atualizar `SHOPIFY_WEBHOOK_SECRET` no Supabase em PARALELO com `SHOPIFY_CLIENT_SECRET`.
- **DÃ©bitos de seguranÃ§a Sprint 4.1 ainda abertos:** HMAC no `uber-webhook-receiver`, validaÃ§Ã£o server-side de `shipping_fee_cents`. Sprint 4.7 nÃ£o mitiga esses dÃ©bitos â€” mas com Sprint 4.7 mergeada, o `shipping_fee_cents` no webhook `orders/paid` agora reflete o valor REAL cobrado (porque a variant fantasma entra no cart de verdade). Antes, esse campo vinha frequentemente como 0 pelo bug raiz.
- **PrÃ³xima aÃ§Ã£o no `state.md`:** considerar abrir Sprint 5 com foco nos dÃ©bitos de seguranÃ§a restantes (HMAC Uber webhook + server-side validation `shipping_fee_cents`) + integraÃ§Ã£o Bling ERP.

## O que foi feito na sessÃ£o anterior (Sprint 4.6 â€” Fix regressÃ£o de re-render)

- **Bug corrigido:** apÃ³s Sprint 4.5, o TOTAL exibido no `/carrinho` deixou de somar o frete. Sintoma: subtotal R$ 18,94 + frete R$ 10,50 mostrava TOTAL = R$ 18,94 (sem somar). A linha "Frete R$ 10,50" aparecia na UI, mas nÃ£o refletia no total nem no Shopify Cart.
- **Causa raiz:** ciclo de re-render no `Carrinho.tsx` fazia o `useEffect` de sincronizaÃ§Ã£o da variant fantasma no `<ShippingMethodSelector />` cancelar seu prÃ³prio `setTimeout(sync, 300)` repetidamente. A variant fantasma nunca era adicionada ao Shopify Cart. Como `displayTotal = cartCost.totalAmount` (Shopify), o valor refletia sÃ³ os itens normais.
- **Por que a Sprint 4.5 piorou:** o REPLACE atÃ´mico introduzido em 4.5 faz 2 chamadas Shopify em sÃ©rie (`removeLineFromShopifyCart` + `addLineToShopifyCart`), aumentando a janela de execuÃ§Ã£o do `sync()`. Antes, o `sync()` era mais rÃ¡pido (1 chamada) e Ã s vezes conseguia completar entre cancellations. ApÃ³s 4.5, sempre era cancelado antes de completar.
- **Cadeia exata do bug:**
  1. `DeliveryAddressSelector.useEffect` chamava `onResult(buildResultFromAddress(selected))` â€” objeto novo a cada render.
  2. `Carrinho.tsx` fazia `setDeliveryCheck(novoObjeto)` â†’ re-render.
  3. `<ShippingMethodSelector deliveryCheck={novoObjeto}>` re-renderizava.
  4. Dentro do componente, `cepParams` era objeto literal novo a cada render.
  5. O `useEffect` de sync tinha `cepParams` E `deliveryCheck` nas deps â†’ identidade muda â†’ re-roda.
  6. Cleanup `clearTimeout(timer)` cancelava antes dos 300ms â†’ `sync()` nunca executava.
- **SoluÃ§Ã£o (defesa em profundidade, 2 camadas):**
  - **Camada 1 â€” produtor (`DeliveryAddressSelector.tsx`):** memoizar `CepValidationResult` derivado do endereÃ§o selecionado via `useMemo` com chaves primitivas (id, cep, city, state, street, number, complement, neighborhood). SubstituÃ­do tambÃ©m o useEffect que reporta pro pai pra consumir o memo em vez de chamar `buildResultFromAddress` inline.
  - **Camada 2 â€” consumidor (`ShippingMethodSelector.tsx`):** memoizar `cepParams` interno via `useMemo` com chaves primitivas do `deliveryCheck.cepInfo`. Adicionado logging defensivo: contador `cancelCountRef` dispara `console.warn` se â‰¥ 5 cancellations consecutivas sem sync completar. Em DEV, warning adicional quando effect re-roda sem mudanÃ§a de deps primitivas.
- **Arquivos editados:** `src/components/DeliveryAddressSelector.tsx`, `src/components/ShippingMethodSelector.tsx`. 0 migrations, 0 edge functions, 0 mudanÃ§as em `Carrinho.tsx`, 0 mudanÃ§as no `cartStore`.
- **Regras novas:** Nenhuma em `requirements.md`. Fix arquitetural sem alteraÃ§Ã£o de regra de negÃ³cio.
- **DocumentaÃ§Ã£o atualizada:** `fluxo-uber-direct.md` (3 gotchas novos), `fluxo-carrinho-checkout.md` (1 gotcha novo).

### PendÃªncias novas (Sprint 4.6)

- **ValidaÃ§Ã£o manual obrigatÃ³ria pÃ³s-deploy:**
  - Abrir `/carrinho` com 1 marmita + endereÃ§o SJC vÃ¡lido. Confirmar que TOTAL = subtotal + frete (ex: R$ 18,94 + R$ 10,50 = R$ 29,44 exato).
  - Conferir no Shopify Admin â†’ Active carts que existe exatamente 1 linha de "Frete Uber Direct" com o preÃ§o correto.
  - Abrir Console do navegador e confirmar ausÃªncia de warning "Effect re-render loop detectado".
- **CenÃ¡rios de regressÃ£o a testar manualmente:**
  - Subir cart pra 7+ marmitas â†’ variant fantasma sai do cart, TOTAL = subtotal sem frete (correto, frete grÃ¡tis).
  - Voltar pra 6 marmitas â†’ variant fantasma volta, TOTAL = subtotal + frete novo.
  - Trocar endereÃ§o (SJC â†’ outro SJC) â†’ variant fantasma re-cotada, TOTAL atualiza com o novo frete.
  - Trocar endereÃ§o (SJC â†’ fora SJC) â†’ variant fantasma sai do cart, mensagem "NÃ£o entregamos" no `<ShippingMethodSelector />`.
  - Reload da pÃ¡gina com cart de 6 marmitas + endereÃ§o SJC â†’ variant fantasma Ã© re-adicionada automaticamente pelo effect de sync no mount.

### Notas para a prÃ³xima sessÃ£o

- **LiÃ§Ã£o aprendida (importante):** quando um `useEffect` tem objeto literal nas deps, esse objeto precisa ser memoizado UPSTREAM (no produtor) E DOWNSTREAM (no consumidor onde estÃ¡ sendo derivado novamente). Se memoizar sÃ³ num lado, vaza pelo outro. Sprint 4.5 + 4.6 ilustram essa liÃ§Ã£o: 4.5 introduziu o REPLACE atÃ´mico assumindo identidade referencial estÃ¡vel (que nÃ£o existia), 4.6 corrigiu fechando a cadeia.
- **PadrÃ£o a seguir em features futuras envolvendo `deliveryCheck`:** se aparecer um terceiro consumer do `CepValidationResult` (ex: componente de cÃ¡lculo de prazo de entrega, badge de cobertura no Header, etc), ele DEVE memoizar internamente quaisquer derivaÃ§Ãµes antes de usar em deps de useEffect. O padrÃ£o estÃ¡ documentado em `fluxo-carrinho-checkout.md` gotcha novo.
- **Logging defensivo Ã© canÃ¡rio em produÃ§Ã£o:** o warning "Effect re-render loop detectado" foi projetado pra disparar APENAS em regressÃµes reais (5 cancellations consecutivas sem sync completar Ã© cenÃ¡rio anormal). Se aparecer em logs de produÃ§Ã£o, investigar imediatamente â€” provÃ¡vel regressÃ£o de memoizaÃ§Ã£o similar.
- **DÃ©bitos de seguranÃ§a da Sprint 4.1 ainda abertos:** HMAC no `uber-webhook-receiver`, validaÃ§Ã£o server-side de `shipping_fee_cents`. Fix de 4.6 nÃ£o mitiga (apenas garante que cliente legÃ­timo seja cobrado corretamente).
- **PrÃ³xima aÃ§Ã£o no `state.md`:** se as 5 sessÃµes de fix (4.1, 4.2, 4.3, 4.4, 4.5, 4.6) estiverem completas e o cart estiver estÃ¡vel em produÃ§Ã£o, considerar fechar Sprint 4 e abrir Sprint 5 com foco nos dÃ©bitos de seguranÃ§a + integraÃ§Ã£o Bling ERP.

## O que foi feito na sessÃ£o anterior (Sprint 4.5 â€” Fix bug do frete duplicado)

- **Bug corrigido:** o total exibido no `/carrinho` somava o frete mÃºltiplas vezes (sintoma reportado: subtotal R$ 18,94 + frete R$ 10,50 deveria dar R$ 29,44, mas mostrava R$ 36,76 â€” diferenÃ§a de R$ 7,32, indicando 2 linhas da variant fantasma no Shopify Cart com cotaÃ§Ãµes diferentes).
- **Causa raiz:** `cartStore.addItem` tratava a variant fantasma como item normal e somava `quantity` no branch `existingItem`. Combinado com cart hidratado do `localStorage` em estado bugado de sessÃ£o anterior, gerava mÃºltiplas linhas no Shopify Cart com preÃ§os de cotaÃ§Ãµes distintas. O `displayTotal` exibido vem do `cartCost.totalAmount` do Shopify (fonte da verdade), por isso o nÃºmero errado refletia direto na UI.
- **SoluÃ§Ã£o (defesa em profundidade, 2 camadas):**
  - **Camada 1 â€” store:** `cartStore.addItem` detecta `isShippingVariant(variantId)` e, se a variant fantasma jÃ¡ existe, faz REPLACE atÃ´mico (`removeLineFromShopifyCart` + `addLineToShopifyCart`) em vez de somar quantity. Early return impede o fluxo normal de executar em sequÃªncia.
  - **Camada 2 â€” componente:** `<ShippingMethodSelector />` ganhou effect de cleanup defensivo no mount (one-shot, guard via `useState`) que detecta variant fantasma com `quantity > 1` herdada do localStorage e remove antes do effect de sincronizaÃ§Ã£o rodar. Simplificou tambÃ©m o effect de sync â€” nÃ£o precisa mais do bloco condicional `if (latestShippingItem) await removeItem(...)`, porque o `addItem` agora faz REPLACE atÃ´mico internamente.
- **Arquivos editados:** `src/stores/cartStore.ts` (addItem refatorado), `src/components/ShippingMethodSelector.tsx` (cleanup + sync simplificado). 0 migrations, 0 edge functions.
- **Regras adicionadas:** R50 em `requirements.md` (variant fantasma Ã© singleton).
- **DocumentaÃ§Ã£o atualizada:** `fluxo-uber-direct.md` (3 gotchas novos + referÃªncia R50), `fluxo-carrinho-checkout.md` (regra 5 expandida + 1 gotcha novo).

### PendÃªncias novas (Sprint 4.5)

- **ValidaÃ§Ã£o manual obrigatÃ³ria pÃ³s-deploy:** abrir `/carrinho` com 1 marmita + endereÃ§o SJC vÃ¡lido, conferir no Shopify Admin â†’ Active carts que existe apenas UMA linha de "Frete Uber Direct", e confirmar que TOTAL no resumo = subtotal + frete (sem diferenÃ§a).
- **CenÃ¡rios de regressÃ£o a testar manualmente:**
  - Adicionar 1 marmita â†’ cart cria variant fantasma com cotaÃ§Ã£o X
  - Trocar endereÃ§o â†’ cotaÃ§Ã£o re-cota com valor Y â†’ confirmar que cart tem apenas 1 linha com valor Y (nÃ£o 2 com X+Y)
  - Subir pra 7 marmitas â†’ variant fantasma Ã© removida â†’ cart tem 0 linhas de frete
  - Voltar pra 6 marmitas â†’ variant fantasma volta com 1 Ãºnica linha
  - Recarregar a pÃ¡gina com cart em qualquer estado â†’ cleanup defensivo no mount nÃ£o deve causar comportamento visÃ­vel ao usuÃ¡rio

### Notas para a prÃ³xima sessÃ£o

- O `<ShippingMethodSelector />` agora confia 100% no `cartStore.addItem` para o singleton da variant fantasma. Se alguÃ©m mexer no `addItem` esquecendo da regra R50, o componente NÃƒO vai mais compensar â€” o cleanup defensivo sÃ³ pega o caso de localStorage bugado, nÃ£o regressÃµes do prÃ³prio store.
- O cleanup defensivo Ã© one-shot (guard `didCleanupOnMount`) â€” depois do primeiro mount da sessÃ£o, ele nÃ£o roda mais. Isso Ã© proposital pra nÃ£o interferir com o flow normal do effect de sync.
- Os dÃ©bitos de seguranÃ§a da Sprint 4.1 (HMAC no `uber-webhook-receiver`, validaÃ§Ã£o server-side de `shipping_fee_cents`) continuam abertos. O fix dessa sprint NÃƒO mitiga esses dÃ©bitos â€” apenas evita que o cliente legÃ­timo seja cobrado errado. Cliente malicioso ainda pode burlar via console zerando preÃ§o da variant.

## O que foi feito na sessÃ£o anterior (Sprint 4.4 â€” Cupom PIX condicional)

- **Bug corrigido:** cupom PIX falhava silenciosamente em carrinhos â‰¥7 marmitas porque `PIX5` estÃ¡ configurado como NÃƒO combinÃ¡vel no Shopify Admin e conflitava com os Automatic Discounts dos Kits (7/14/21/28).
- **SoluÃ§Ã£o:** introduzir cupom novo `PIX3` (3% off, combinÃ¡vel com descontos de produto), aplicado quando carrinho â‰¥7. PIX5 mantido inalterado para <7.
- Cupom `PIX3` criado manualmente no Shopify Admin (paridade de 26 produtos elegÃ­veis com PIX5).
- `src/components/PaymentMethodSelector.tsx` refatorado:
  - Helper `getPixCouponForCart(totalNonShippingItems)` retorna `{ code, percent }` condicional ao threshold (`SHIPPING_FREE_THRESHOLD`)
  - Nova prop `totalNonShippingItems` (passada pelo Carrinho.tsx)
  - Badge dinÃ¢mico ("PIX 3% off" ou "PIX 5% off")
  - `useEffect` de reatividade: troca cupom automaticamente quando cliente cruza threshold com PIX selecionado
  - `console.error` com payload do cart sempre que Shopify retorna `applicable=false` inesperado
- `src/pages/Carrinho.tsx`: passa `totalNonShippingItems={totalNonShippingItems}` ao `<PaymentMethodSelector />` (1 linha)
- R19 reescrita em `requirements.md` documentando a regra condicional + diagnÃ³stico
- `fluxo-carrinho-checkout.md` regra 9 substituÃ­da + 3 gotchas adicionados
- 1 componente editado, 1 pÃ¡gina editada (1 linha), 0 migrations, 0 edge functions

### PendÃªncias novas (Sprint 4.4)

- **DÃ©bito tÃ©cnico (UX):** `PixCallout.tsx` ainda diz estaticamente "PIX 5% off" em Product/CartDrawer/Kit/KitLivre. Para clientes que pretendem fechar â‰¥7 marmitas, isso Ã© uma inconsistÃªncia educativa (vitrine promete 5%, carrinho aplica 3%). Sprint futura: tornar o callout sensÃ­vel Ã  quantidade do carrinho ou exibir "PIX 5% ou 3% off conforme quantidade".
- **ValidaÃ§Ã£o de produÃ§Ã£o:** apÃ³s deploy, testar fluxo end-to-end real em todas as faixas de quantidade (1, 6, 7, 13, 14, 20, 21, 27, 28+) e confirmar que o Shopify Admin Orders mostra cada cupom corretamente aplicado.

### Notas para a prÃ³xima sessÃ£o

- Se `PIX5` ou `PIX3` forem desativados ou tiverem combinabilidade alterada no Shopify Admin, o frontend precisa ser ajustado em paralelo. O par Ã© coreografado.
- O threshold de troca de cupom (`SHIPPING_FREE_THRESHOLD = 7`) Ã© COMPARTILHADO com: regra de frete Uber Direct (R34), Kits do Shopify (Kit 7/14/21/28). Qualquer mudanÃ§a no nÃºmero 7 impacta esses TRÃŠS sistemas + a regra PIX.
- O diagnÃ³stico `console.error` com payload do cart vai ajudar a detectar futuros desalinhamentos entre Shopify Admin e cÃ³digo (ex: alguÃ©m renomear o cupom, mexer em combinabilidade, expirar a data).

## O que foi feito na sessÃ£o anterior (Sprint 4.3 â€” Seletor de endereÃ§o no carrinho)

- Criado componente `src/components/DeliveryAddressSelector.tsx` (4 estados: guest, loading, vazio, lista)
- Adicionado helper sÃ­ncrono `isAreaDeliverable(uf, city)` em `src/lib/cepValidator.ts`
- SubstituÃ­do `<CepChecker />` por `<DeliveryAddressSelector />` no `src/pages/Carrinho.tsx`
- Adicionado cart attribute `selected_address_id` no `handleCheckout` (2 ocorrÃªncias â€” handler direto + useEffect pÃ³s-login)
- Reusados sem mudanÃ§a: `<AuthDialog />`, `<AddressFormDialog />`, `useAddresses()`, `<ShippingMethodSelector />`
- 1 componente criado, 2 arquivos editados, 0 migrations
- Regras adicionadas: R46, R47, R48, R49 em `requirements.md`

### PendÃªncias novas (Sprint 4.3)
- DÃ©bito tÃ©cnico: migrar dados legados de `profiles.address/cep/...` para a tabela `addresses` via script SQL idempotente (fora do escopo desta sprint)

### Notas para a prÃ³xima sessÃ£o
- Se aparecer pedido de "remover CepChecker do codebase", verificar antes onde mais ele Ã© usado â€” neste momento sÃ³ `/carrinho` consumia, e a regra R49 explicita que o componente foi preservado.
- A whitelist `DELIVERY_AREAS` continua em `cepValidator.ts`. Expandir cobertura = editar essa constante (sem touch em DB).
- O cart attribute `selected_address_id` pode ser consumido pelo `shopify-webhook-receiver` em sprint futura se quisermos cross-check do endereÃ§o do pedido contra o cadastrado no Supabase.

## O que foi feito na sessÃ£o anterior (Sprint 4.2 â€” Return URL no checkout Shopify)

- `src/config/site.ts` criado: exporta `SITE_URL` (com fallback `https://jilomarmitas.com` e override via `VITE_SITE_URL`) e `SITE_HOSTNAME`. Fonte Ãºnica de URL canÃ´nica no frontend (equivalente em runtime do `SITE_URL` jÃ¡ usado pelo gerador SEO em build time).
- `src/lib/shopify.ts` ganhou helper `appendReturnToCheckoutUrl(checkoutUrl, returnTo?)` que adiciona `?return_to=<SITE_URL>` ao checkout antes do redirect (fail-safe via try/catch).
- `src/pages/Carrinho.tsx` `handleCheckout` (e seu useEffect espelho de auto-checkout pÃ³s-login) agora gravam cart attribute `return_url` junto com `delivery_method` e `uber_quote_id`, e o checkout Ã© aberto com `appendReturnToCheckoutUrl`.
- `src/pages/Product.tsx` `handleBuyNow` recebeu o mesmo tratamento (cart attribute + helper).
- R45 adicionada ao `requirements.md` documentando o padrÃ£o.
- `fluxo-carrinho-checkout.md` atualizado (regra 13, nova regra 18, gotchas, tabela de arquivos).
- PrÃ©-requisito complementar (manual no Shopify Admin): configurar `checkout.jilomarmitas.com` como domÃ­nio primÃ¡rio em Settings â†’ Domains.
- O `CartDrawer.tsx` nÃ£o precisou de mudanÃ§a (nÃ£o vai direto pro checkout â€” navega `/carrinho`).
- Edge Functions nÃ£o precisaram de mudanÃ§a: `note_attributes` propagam pro webhook `orders/paid` automaticamente; o atributo `return_url` aparece como `note_attribute` no pedido sem cÃ³digo novo.
- âš ï¸ Importante: A soluÃ§Ã£o originalmente cogitada de injetar JavaScript via "Additional Scripts" na Order Status Page foi descartada. A Shopify descontinuou essa funcionalidade em 28/08/2025 (read-only desde entÃ£o; auto-upgrade dos nÃ£o-Plus iniciando jan/2026). CustomizaÃ§Ãµes JS na thank-you page hoje exigem Checkout UI Extensions (apps Shopify), o que estÃ¡ fora do escopo deste Sprint. A combinaÃ§Ã£o cÃ³digo + domÃ­nio primÃ¡rio Ã© suficiente.

## O que foi feito na sessÃ£o anterior (Sprint 4.1 â€” Frete Uber Direct)

- Migration `20260429000000_orders_uber_delivery_fields.sql` adicionando 6 campos a `orders` (jÃ¡ existia, agora documentada)
- Script `scripts/setup-shipping-variant.ts` (jÃ¡ existia) cria produto fantasma "Frete Uber Direct" no Shopify (REST API, idempotente)
- Adicionado scope `write_products` ao Custom App existente â€” **NÃƒO foi necessÃ¡rio**: validaÃ§Ã£o em 2026-04-29 confirmou que o app jÃ¡ tinha 178 scopes ativos, incluindo todos os necessÃ¡rios para a feature. Pulamos o passo de reinstalaÃ§Ã£o.
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
- `cepValidator.ts` removida menÃ§Ã£o a "Frete grÃ¡tis" da mensagem de CEP atendido
- R34 a R44 adicionadas em `requirements.md`. R16 e R17 marcadas como atualizadas.
- `fluxo-uber-direct.md` criado documentando todo o fluxo
- `fluxo-carrinho-checkout.md`, `fluxo-shopify-sync.md` atualizados

## HistÃ³rico de sprints
- **Sprint 1 (2026-04-16)** â€” Ãrea do cliente completa (auth, perfil, pedidos, endereÃ§os, timeline)
- **Sprint 2 (2026-04-16)** â€” Shopify customer sync + checkout gating
- **Sprint 3 (2026-04-22)** â€” SEO tradicional + GEO (llms.txt) com geraÃ§Ã£o em build time + correÃ§Ã£o do domÃ­nio canÃ´nico
- **Sprint 3.5 (2026-04-22)** â€” CorreÃ§Ã£o do shell HTML: meta tags estÃ¡ticas completas, favicon vÃ¡lido, og-image prÃ³pria, robots.txt regenerado
- **Sprint 4.1 (2026-04-29)** â€” Frete Uber Direct condicional
- **Sprint 4.2 (2026-05-11)** â€” Return URL no checkout Shopify (`return_to` querystring + cart attribute `return_url`) e centralizaÃ§Ã£o da constante `SITE_URL` em `src/config/site.ts`
- **Sprint 4.3 (2026-05-18)** â€” Seletor de endereÃ§o no carrinho (`<DeliveryAddressSelector />` substituindo `<CepChecker />`, cart attribute `selected_address_id`)
- **Sprint 4.4 (2026-05-20)** â€” Cupom PIX condicional por quantidade (PIX5 < 7 marmitas, PIX3 â‰¥ 7)
- **Sprint 4.5 (2026-05-27)** â€” Fix variant fantasma duplicada no cart (REPLACE atÃ´mico no `cartStore` + cleanup defensivo no `<ShippingMethodSelector />`)
- **Sprint 4.6 (2026-05-27)** â€” Fix regressÃ£o Sprint 4.5: variant fantasma nÃ£o entrava no cart (memoizaÃ§Ã£o de `CepValidationResult` no produtor + `cepParams` no consumidor + logging defensivo)
- **Sprint 4.7 (2026-05-27)** â€” RefatoraÃ§Ã£o OAuth Client Credentials Grant para Shopify Admin API (tabela `shopify_admin_tokens` + helper `_shared/shopify-admin-auth.ts`) + hard-block do `canCheckout` validando estado real do Shopify Cart
- **Sprint 4.8 (2026-05-28)** â€” TOTAL da pÃ¡gina de carrinho via somatÃ³ria local (`subtotal + frete`), desacoplando display da cobranÃ§a Shopify
- **Sprint 5.0 (2026-06-01)** â€” Causa raiz resolvida: produto fantasma estava publicado sÃ³ no Point of Sale, nÃ£o no Online Store; fix = publicar no Online Store + `status: ACTIVE` + filtro `-tag:__internal_shipping` nas queries de catÃ¡logo. UNLISTED foi testado e NÃƒO Ã© exposto pela Storefront desta loja. ValidaÃ§Ã£o pÃ³s-add (R55) mantida como defesa. (Bug aberto: PIX trava o hard-block do checkout â€” ver PendÃªncias.)

## PendÃªncias

### Carryover Sprint 3.5
- Submeter `sitemap.xml` no Google Search Console e Bing Webmaster Tools apÃ³s o go-live
- Request Indexing no GSC para home, /cardapio e /colecao/* apÃ³s deploy do Sprint 3.5
- Preencher `<meta name="google-site-verification" content="..." />` no index.html
- Substituir og-image.jpg provisÃ³ria se foi usado fallback
- Testar ingestÃ£o do `llms-full.txt` em conversas com ChatGPT, Claude e Perplexity

### Carryover Sprint 1/2
- DÃ©bito tÃ©cnico: testar fluxo end-to-end de signup â†’ confirmaÃ§Ã£o de email â†’ sync Shopify
- DÃ©bito tÃ©cnico: validaÃ§Ã£o de CPF com mÃ¡scara + checksum
- DÃ©bito tÃ©cnico: integraÃ§Ã£o ViaCEP no AddressFormDialog
- DÃ©bito de seguranÃ§a: migrar anon key do Supabase para `.env`

### Sprint 4.1 â€” dÃ©bitos novos
- **DÃ©bito de seguranÃ§a CRÃTICO:** webhook `uber-webhook-receiver` NÃƒO valida HMAC ainda â€” implementar antes do go-live
- **DÃ©bito de seguranÃ§a:** validaÃ§Ã£o server-side de `shipping_fee_cents` (cliente pode burlar via console zerando preÃ§o da variant antes do `cartLinesAdd`). MitigaÃ§Ã£o: comparar com cotaÃ§Ã£o Uber re-confirmada no webhook `orders/paid`
- **DÃ©bito de produto:** UI admin para gerenciar orders com `delivery_status='jilo_pending'` (â‰¥ 7 marmitas, despache manual)
- **DÃ©bito de produto:** Tracking link Uber (`uber_tracking_url`) na Ã¡rea do cliente em `/conta/pedidos/:id`
- Testar end-to-end em sandbox Uber Direct antes de switch para produÃ§Ã£o (`UBER_API_BASE`)
- Validar lat/lng do pickup Jilo com endereÃ§o real da cozinha

### Sprint 4 (resto, ainda nÃ£o tocado)
- Estender `shopify-webhook-receiver` para popular `order_items` (tabela normalizada) â€” hoje `line_items` jsonb continua sendo usado
- Garantir que `orders.user_id` seja preenchido via lookup por email no webhook
- Webhook `customers/update` para refletir mudanÃ§as do Shopify no Supabase
- IntegraÃ§Ã£o Bling ERP

## PrÃ³ximos passos planejados

Sprint 4.3 â€” endurecimento Uber (renomeado do 4.2 original):
1. ValidaÃ§Ã£o HMAC no `uber-webhook-receiver`
2. ValidaÃ§Ã£o server-side de `shipping_fee_cents` no `shopify-webhook-receiver`
3. Painel admin para `jilo_pending` orders (UI mÃ­nima em `/conta/admin` ou similar)

Sprint 4 (resto):
1. Migrar webhook receiver de `line_items` jsonb para `order_items` normalizado
2. Lookup de `user_id` por email
3. Webhook `customers/update`
4. IntegraÃ§Ã£o Bling ERP

## Notas para a prÃ³xima sessÃ£o
- **IMPORTANTE â€” auth Shopify Admin mudou (Sprint 4.7):** o secret `SHOPIFY_ADMIN_ACCESS_TOKEN` nÃ£o existe mais. Toda chamada Ã  Admin API passa por `getShopifyAdminToken()` em `_shared/shopify-admin-auth.ts`. Secrets que vivem nas Edge Functions: `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET`. Ver R51 em `requirements.md`.
- DomÃ­nio canÃ´nico do site Ã© `https://jilomarmitas.com` â€” usar sempre essa URL em qualquer referÃªncia a links absolutos
- Ao adicionar novo prato ao cardÃ¡pio: rodar `npm run seed` depois `npm run seo` e comitar os arquivos gerados
- Ao trocar logo ou og-image: substituir arquivos em `public/`, commitar, publicar, e forÃ§ar Request Indexing no GSC
- `llms.txt` e `llms-full.txt` sÃ£o padrÃµes emergentes â€” a spec pode evoluir. Monitorar llmstxt.org
- Se em qualquer momento surgir necessidade de adicionar subdomÃ­nio (ex: blog.jilomarmitas.com), criar sitemap separado e referenciÃ¡-lo no robots.txt
- Meta tags globais continuam no `index.html` estÃ¡tico (R31). Se o projeto crescer e precisar de meta tags por rota (ex.: SEO por produto na pÃ¡gina `/produto/:handle`), adicionar `react-helmet-async` sem remover o que estÃ¡ no shell â€” o shell Ã© fallback para quem nÃ£o roda JS
- **Frete Uber Direct estÃ¡ em produÃ§Ã£o (Sprint 4.1)** â€” qualquer mudanÃ§a no threshold de 7 marmitas exige editar `src/config/shipping.ts` E `supabase/functions/_shared/shipping-constants.ts` (manter sincronizados)
- O produto fantasma "Frete Uber Direct" no Shopify Admin tem `status: draft` propositalmente â€” NÃƒO publicar
- O Custom App Shopify usa um token de "full access" (178 scopes, incluindo `write_products`). Se for revogado/rotacionado, substituto precisa manter pelo menos `write_customers`, `write_products`, `read_orders`, `write_orders`. Atualizar em DOIS lugares: `.env` local (`SHOPIFY_ADMIN_TOKEN`) e Edge Function Secrets (`SHOPIFY_ADMIN_ACCESS_TOKEN`) â€” nomes diferentes, mesmo valor. (Valor literal do token NÃƒO fica documentado aqui â€” vive apenas nos secrets.)
- Se Uber lanÃ§ar API nova ou mudar payload de webhook, ajustar `UBER_STATUS_MAP` em `uber-webhook-receiver/index.ts`
- Edges chamadas server-to-server (`uber-create-delivery`) sÃ£o deployadas com `--no-verify-jwt` e validam o `Authorization: Bearer <service_role>` manualmente
- **URL de auth da Uber Ã© `auth.uber.com/oauth/v2/token`** (validado contra doc oficial em 2026-04-29). Scope Ãºnico: `eats.deliveries`. Token vale 30 dias.
- **Customer ID Uber:** o que aparece no painel como "ID do usuÃ¡rio" (formato UUID) Ã© o que vai nas URLs `/v1/customers/{customer_id}/...`. NÃƒO confundir com `client_id` (OAuth)
- **DÃ©bito de operaÃ§Ã£o:** o `client_secret` cadastrado precisa ser confirmado contra o painel Uber Direct. Se foi rotacionado depois do compartilhamento inicial, atualizar o secret no Supabase
- Antes do go-live, validar se as credenciais Uber sÃ£o de sandbox ou produÃ§Ã£o. No painel: aviso azul "Test mode" no topo = sandbox. Sem aviso = produÃ§Ã£o.
- **Sprint 4.2:** ApÃ³s deploy do cÃ³digo, confirmar no Shopify Admin: `checkout.jilomarmitas.com` configurado como domÃ­nio primÃ¡rio e SSL ativo. Esse passo manual Ã© complementar ao cÃ³digo â€” sem ele, o `?return_to=` pode nÃ£o ser honrado em todos os flows.
- `VITE_SITE_URL` pode ser usado pra apontar pra ambientes nÃ£o-produÃ§Ã£o (staging/preview) sem mexer no cÃ³digo â€” coloca no `.env` local ou nas vars do hosting. Sem override, fallback Ã© sempre `https://jilomarmitas.com`.
- **Sobre customizaÃ§Ã£o da thank-you page Shopify:** Se em algum momento precisarmos sobrescrever o botÃ£o "Continue Shopping" ou injetar lÃ³gica na thank-you page (pixel custom, mensagem personalizada), a Ãºnica via vÃ¡lida hoje Ã© construir uma Checkout UI Extension como app Shopify dedicada â€” Additional Scripts foi descontinuado. Estimativa: 2â€“3 dias de dev. Priorizar somente se houver demanda concreta.


