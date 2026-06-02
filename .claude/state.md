# Estado do projeto Jilo

## Última atualização
2026-06-01 (Sprint 5.0 — Causa raiz resolvida: produto fantasma precisa estar ACTIVE + publicado no Online Store; UNLISTED NÃO é exposto pela Storefront desta loja)

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
- **Sprint 5.0 (2026-06-01)** — Causa raiz resolvida: produto fantasma estava publicado só no Point of Sale, não no Online Store; fix = publicar no Online Store + `status: ACTIVE` + filtro `-tag:__internal_shipping` nas queries de catálogo. UNLISTED foi testado e NÃO é exposto pela Storefront desta loja. Validação pós-add (R55) mantida como defesa. (Bug aberto: PIX trava o hard-block do checkout — ver Pendências.)

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
