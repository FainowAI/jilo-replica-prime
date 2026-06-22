# Fluxo: Frete Uber Direct condicional

## Visão geral

Frete cobrado em real-time via Uber Direct quando o cart tem menos de 7 marmitas. A partir de 7, frete grátis (entrega Jilo, despachada manualmente em sprint futura).

A loja Jilo está em plano Shopify que não suporta Shipping Rates condicionais por quantidade e a estratégia foi NÃO usar apps de terceiros nem fazer upgrade. Em vez disso, criamos um produto fantasma no Shopify ("Frete Uber Direct", `status: ACTIVE`, publicado no Online Store, tag `__internal_shipping`) cujo preço é atualizado em real-time via Admin GraphQL e adicionado ao cart como uma linha normal. O produto é `ACTIVE` (vendável via Storefront) mas é mantido fora das listagens por **filtro de tag** nas queries de catálogo (`-tag:__internal_shipping`) — a variant fantasma só aparece dentro do cart, nunca em buscas/coleções.

**Sprint 5.0 — root cause do bug de cart (publicação no sales channel):** Por 5 sprints a variant fantasma "parecia entrar no cart mas não entrava". A causa raiz verificada (Junho 2026, via Playwright + Storefront/Admin API): o produto fantasma estava publicado **só no sales channel "Point of Sale"**, não no **"Online Store"** (canal que o token Storefront lê). Disponibilidade via Storefront = publicação no sales channel, ortogonal ao status. Por isso `cartLinesAdd` da variant retornava erro explícito "A mercadoria … não existe". Correção: `publishablePublish` no Online Store + `status: ACTIVE` + filtro de tag nas queries. **Tentativa intermediária refutada:** mudar pra `UNLISTED` (edge `set-product-unlisted`) NÃO resolveu — com UNLISTED + publicado, a variant continuou retornando `node: null` na Storefront em todas as versões testadas. Só ACTIVE funcionou. Ver R54.

## Arquivos envolvidos

**Status do produto fantasma (Sprint 5.0, R54):** O produto "Frete Uber Direct" tem status `ACTIVE` E está publicado no sales channel **"Online Store"** no Shopify Admin (NÃO `DRAFT`, NÃO `UNLISTED`). Os dois são necessários: (1) publicação no Online Store — sem ela a Storefront não enxerga a variant (`cartLinesAdd` → "a mercadoria não existe"); (2) status ACTIVE — testado empiricamente, `UNLISTED` + publicado retornou `node: null` na Storefront em todas as versões (2025-07/10/01/unstable). Como ACTIVE deixa o produto visível em listagens, TODA query de catálogo exclui via `excludeInternalShipping()` (`-tag:__internal_shipping`). ⚠️ A edge `set-product-unlisted` está OBSOLETA (setar UNLISTED re-quebra o carrinho) — não rodar.

**Auth Shopify Admin (Sprint 4.7):** Todas as chamadas à Admin API GraphQL passam pelo helper `supabase/functions/_shared/shopify-admin-auth.ts` (`getShopifyAdminToken()`). Não usar mais `SHOPIFY_ADMIN_ACCESS_TOKEN` direto do env — esse secret foi removido. O helper resolve o token via cache (tabela `shopify_admin_tokens`) ou refresh via Client Credentials Grant. Ver R51.

### Config
| Arquivo | Descrição |
|---------|-----------|
| `src/config/shipping.ts` | Constantes de frete: `SHIPPING_FREE_THRESHOLD = 7`, `SHIPPING_VARIANT_ID` (do .env), `DELIVERY_PROMISE_LABEL = "Entrega em até 48h"` (fonte única da copy da promessa), `LALAMOVE_FIXED_FEE_CENTS = 1990` (R$ 19,90) e `LALAMOVE_METHOD_LABEL` (fallback Lalamove — Item 5), tipo `DeliveryMethod = "uber_direct" \| "jilo_own" \| "lalamove"`, helpers `getDeliveryMethod`, `isFreeShipping`, `isShippingVariant` |
| `supabase/functions/_shared/shipping-constants.ts` | Constantes equivalentes para uso em Edge Functions Deno (manter sincronizado com `src/config/shipping.ts`): `SHIPPING_FREE_THRESHOLD`, `LALAMOVE_FIXED_FEE_CENTS`, tipo `DeliveryMethod` (inclui `"lalamove"`), `getDeliveryMethod`. Também consumido pela `02-track-edge` — apenas adicionar, nunca alterar o existente |

### Hooks
| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/useNonShippingTotalItems.ts` | `useNonShippingTotalItems()` conta marmitas reais (filtra variant fantasma) e `useVisibleCartItems()` retorna items para UI |
| `src/hooks/useShippingQuote.ts` | TanStack Query que cota frete via Uber Direct. staleTime 14min. Habilitado só se cart < 7 itens E CEP atendido |

### Lib
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/uberDirect.ts` | Cliente das edges `uber-quote` e `update-shipping-variant-price` via `supabase.functions.invoke` |
| `src/lib/shopify.ts` | Adicionado: mutation `cartAttributesUpdate` + helper `setCartAttributes(cartId, [{key, value}])` |

### Componentes
| Arquivo | Descrição |
|---------|-----------|
| `src/components/ShippingMethodSelector.tsx` | UI no resumo do `/carrinho`. Mostra mensagem de frete grátis ou cotação Uber. Sincroniza variant fantasma no cart Shopify (debounce 300ms) |

### Páginas (editadas)
| Arquivo | Mudanças |
|---------|----------|
| `src/pages/Carrinho.tsx` | Trocou contagem para `useNonShippingTotalItems`, lista para `useVisibleCartItems`, removeu "Free Shipping Bar" (substituído pelo selector), adicionou `<ShippingMethodSelector />` no resumo, `handleCheckout` async grava cart attributes via `setCartAttributes` antes do redirect |
| `src/components/CartDrawer.tsx` | Mesma troca de contagem/lista, mensagem de frete condicional ao threshold |
| `src/lib/cepValidator.ts` | Removida menção a "Frete grátis" da mensagem positiva (regra agora vem do `ShippingMethodSelector`) |

### Edge Functions (criadas)
| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/uber-quote/index.ts` | Cota frete via Uber Direct. OAuth2 client_credentials cacheado por isolate. POST `/v1/customers/{id}/delivery_quotes`. CORS `*`. `--no-verify-jwt` |
| `supabase/functions/update-shipping-variant-price/index.ts` | Atualiza preço da variant fantasma via Admin GraphQL `productVariantsBulkUpdate`. Resolve `productGid` em primeira call (cache no isolate). Validação `0 < fee_cents <= 100000` |
| `supabase/functions/uber-create-delivery/index.ts` | Cria delivery efetiva. Chamada server-to-server pelo `shopify-webhook-receiver` em `orders/paid`. Valida `delivery_method`, `delivery_status`, `shipping_address`. Idempotente (retorna early se já dispatched). Em falha grava `delivery_status='uber_failed'` |
| `supabase/functions/uber-webhook-receiver/index.ts` | Recebe atualizações de status da Uber. Registra em `webhook_events` com `source='uber_direct'`, `external_id="${deliveryId}:${uberStatus}"`. Mapeia status Uber para enum `delivery_status`. Sempre retorna 200 |

### Edge Functions (editadas)
| Arquivo | Mudanças |
|---------|----------|
| `supabase/functions/shopify-webhook-receiver/index.ts` | Handler de `orders/paid` agora popula `delivery_method`, `uber_quote_id`, `shipping_fee_cents`, `delivery_status`. Se `uber_direct` + tem quote, dispara fire-and-forget para `uber-create-delivery` |

## Tabelas do banco

`public.orders` (campos relevantes para esta feature):

| Coluna | Tipo | Default | CHECK |
|---|---|---|---|
| `delivery_method` | text NULL | NULL | `IN ('uber_direct', 'jilo_own')` |
| `uber_quote_id` | text NULL | NULL | — |
| `uber_delivery_id` | text NULL | NULL | — |
| `uber_tracking_url` | text NULL | NULL | — |
| `shipping_fee_cents` | integer | 0 | — |
| `delivery_status` | text NULL | `'pending_dispatch'` | 9 valores |

Valores válidos para `delivery_status`: `pending_dispatch`, `uber_pickup_assigned`, `uber_pickup_complete`, `uber_in_transit`, `uber_dropoff_complete`, `uber_failed`, `jilo_pending`, `jilo_in_transit`, `jilo_delivered`.

`public.webhook_events` reusada com `source='uber_direct'` (sem alterações de schema).

Migration: `20260429000000_orders_uber_delivery_fields.sql` (já aplicada).

## Env vars necessárias

### Frontend (`.env` Lovable)
| Nome | Exemplo |
|------|---------|
| `VITE_SHOPIFY_SHIPPING_VARIANT_ID` | `gid://shopify/ProductVariant/123456` |

### Edge Functions Secrets (Supabase Project Settings)

**Shopify (compartilhados — já existiam):**
| Nome | Origem |
|------|--------|
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Custom App existente. App já tem 178 scopes (incluindo `write_products`, `write_customers`) — sem necessidade de reinstalar |
| `SHOPIFY_STORE_DOMAIN` | `jnutg9-u2.myshopify.com` |
| `SHOPIFY_API_VERSION` | `2025-10` |
| `SHOPIFY_WEBHOOK_SECRET` | Webhooks Shopify Admin |

**Shopify (novo):**
| Nome | Origem |
|------|--------|
| `SHOPIFY_SHIPPING_VARIANT_ID` | Saída de `npm run setup:shipping` |

**Uber Direct:**
| Nome | Origem |
|------|--------|
| `UBER_CLIENT_ID` | Painel Uber Direct |
| `UBER_CLIENT_SECRET` | Painel Uber Direct |
| `UBER_CUSTOMER_ID` | Painel Uber Direct |
| `UBER_API_BASE` | `https://api.uber.com` (prod) / `https://sandbox-api.uber.com` (dev) |

**Pickup Jilo** — endereço oficial = CNPJ JILO ALIMENTACAO LTDA (05.574.020/0001-90), corrigido em Junho/2026. ⚠️ São **Edge Function Secrets**: setados via Dashboard (Project Settings → Edge Functions → Secrets) ou `supabase secrets set`. **NÃO** são graváveis pelo MCP do Supabase (que não tem ferramenta de secret) nem por `execute_sql` (não estão em tabela). As edges leem o valor no boot do isolate — após alterar o secret, redeployar `uber-quote`/`uber-create-delivery` (ou aguardar cold start) para o novo valor valer.
| Nome | Valor |
|------|--------|
| `JILO_PICKUP_NAME` | `Jilo Marmitas` |
| `JILO_PICKUP_PHONE` | `+5512988950426` (E.164) |
| `JILO_PICKUP_ADDRESS_JSON` | `{"street_address":["Avenida Engenheiro Juarez de Siqueira Britto Wanderley, 50","Loja 05"],"city":"São José dos Campos","state":"SP","zip_code":"12238565","country":"BR"}` (Eldorado, SJC/SP, CEP 12238-565) |
| `JILO_PICKUP_LATITUDE` | `-23.2625966` (eixo da avenida; confirmar pino do nº 50 antes de produção) |
| `JILO_PICKUP_LONGITUDE` | `-45.9155005` |

**Custom App scopes obrigatórios:** `write_customers` (existente), `read_customers` (opcional), `write_products` (novo), `read_products` (opcional).

## Regras de negócio

Vide `.claude/requirements.md` regras R34 a R44.

**Nova em Sprint 4.5:** R50 — variant fantasma é singleton (REPLACE atômico em re-sincronização). Vide `requirements.md`.

**Nova em Sprint 5.0:** R54 — produto fantasma deve ser `status: ACTIVE` + publicado no sales channel "Online Store" (UNLISTED/DRAFT não funcionam na Storefront desta loja), com filtro `-tag:__internal_shipping` nas queries de catálogo. Vide `requirements.md`.

**Fallback Lalamove (Item 5, jun/2026):** Quando o endereço está em SJC mas fora do raio Uber Direct (Uber retorna `address_undeliverable`) e o cart tem <7 marmitas, oferecemos um terceiro método: "Entrega Lalamove", frete fixo R$ 19,90 (`LALAMOVE_FIXED_FEE_CENTS = 1990`, espelha o shipping rate do painel Shopify), despacho manual pela frota interna, flagado via cart attribute `delivery_method = 'lalamove'`. A escolha NÃO é derivada por quantidade — `getDeliveryMethod` segue decidindo só `uber_direct` vs `jilo_own`; o `lalamove` é uma escolha EXPLÍCITA do usuário no fallback.

Mecânica no `<ShippingMethodSelector />`:
- **Distinção de cenário:** `deliveryCheck.isDeliverable === false` = cidade fora de SJC (sem fallback, só bloqueio); `isDeliverable === true` + `UberQuoteError.code === "address_undeliverable"` = SJC fora do raio Uber (oferece Lalamove).
- **Estado:** `lalamoveSelected` (useState). Reseta para `false` quando o cenário muda — cart vira frete grátis (`isFree`), endereço deixa de ser entregável, ou a cotação Uber volta a funcionar (`quote` existe). Derivado `wantsLalamove = lalamoveSelected && isUberUndeliverable && isDeliverable && !isFree && cepParams`.
- **UI:** no bloco amarelo do `address_undeliverable`, além da explicação do raio ~5km, um card selecionável "Entrega Lalamove — R$ 19,90" (mesmo padrão de border/ring do `PaymentMethodSelector`); coexiste com a sugestão "adicione mais N marmitas pra frete grátis".
- **Variant fantasma (R50):** mesma SKU singleton do Uber — no Lalamove só muda o PREÇO (fixo `LALAMOVE_FIXED_FEE_CENTS`, não a cotação). O `useEffect` de sync usa um `feeToSync` (Lalamove fixo OU `quote.fee_cents`) com REPLACE atômico. Não há segundo SKU de frete.
- **onQuoteChange:** quando `wantsLalamove`, reporta o sentinela `("lalamove", 1990)` ao `Carrinho.tsx` → `activeQuoteId = "lalamove"`, `activeShippingFeeCents = 1990`. Isso satisfaz `canCheckout` (`free || activeQuoteId !== null`). O hard-block R59 (`freightStateOk`) segue protegendo: só libera quando a variant fantasma de fato entra no Shopify Cart.
- **Checkout (`Carrinho.tsx`):** `handleCheckout` e o effect espelho de auto-checkout pós-login derivam `resolvedDeliveryMethod = activeQuoteId === "lalamove" ? "lalamove" : getDeliveryMethod(...)` e gravam `delivery_method = resolvedDeliveryMethod`. No sentinela Lalamove gravam também `delivery_label = LALAMOVE_METHOD_LABEL` ("Entrega Lalamove", leitura humana no Admin) e PULAM o `uber_quote_id` (não há cotação Uber). `return_url`/`selected_address_id` (R45/R48) e o fail-silent (R26) inalterados.

**Pendências (outros itens):** a nota de dias úteis no card Lalamove (`DELIVERY_BUSINESS_DAYS_NOTE`, PROMPT 3 — ainda não existe; há um TODO no componente) e o CHECK de `orders.delivery_method` aceitando `'lalamove'` (hoje `IN ('uber_direct','jilo_own')` + NULL — migration necessária antes de qualquer order ser gravada como lalamove).

**Promessa de entrega (48h):** A entrega é em até 48h **independente do método** (Uber Direct, frota Jilo ou Lalamove). A copy vem da constante `DELIVERY_PROMISE_LABEL` (`src/config/shipping.ts`) e é exibida em TODOS os ramos de UI do `<ShippingMethodSelector />` (grátis e pago) e nos dois ramos do `CartDrawer`. No ramo pago, o `~Ymin` da cotação Uber é só a janela de coleta/transporte — por isso é rotulado "Coleta Uber em ~Ymin", para não conflitar com a promessa de 48h.

**Nova em Sprint 5.0:** R55 — verificação pós-add da variant fantasma (defesa em profundidade). Após `addLineToShopifyCart` retornar `success: true` para a variant fantasma, o `cartStore.addItem` faz um `fetchCartFull` e confirma que a linha existe de fato no cart remoto (`lines.edges[].node.merchandise.id === variantId`). Se não existir, loga `[cartStore] CRITICAL` e reverte o `items[]` local (REPLACE) ou não o atualiza (primeira inserção), forçando re-tentativa no próximo render do `ShippingMethodSelector`. A verificação roda APENAS para `isShippingVariant(...)` — itens normais (marmitas) seguem o fluxo simples sem chamada extra. Protege contra regressões do tipo "sucesso aparente, linha não entra" (ex.: produto despublicado do Online Store, status revertido pra DRAFT/UNLISTED). Vide `requirements.md`.

## Fluxo do usuário

### Cliente com cart < 7 marmitas

1. Cliente adiciona marmitas ao cart (CartDrawer abre)
2. CartDrawer mostra "Frete grátis a partir de 7 marmitas (faltam X)"
3. Cliente vai para `/carrinho`
4. Resumo do pedido mostra `<CepChecker />` + aviso "Verifique antes de finalizar"
5. Cliente verifica CEP → resultado positivo dispara `<ShippingMethodSelector />`
6. `useShippingQuote` chama edge `uber-quote` → recebe `{quote_id, fee_cents}`
7. `<ShippingMethodSelector />` exibe "Entrega Uber Direct • R$ X • Coleta Uber em ~Ymin" + nota "Entrega em até 48h, qualquer que seja o método" (constante `DELIVERY_PROMISE_LABEL`). O `~Ymin` é a janela de coleta/transporte da Uber; a promessa ao cliente é sempre 48h, independente do método.
8. Em paralelo, sincroniza variant fantasma no Shopify Cart (debounce 300ms):
   - Chama edge `update-shipping-variant-price` com `fee_cents`
   - Adiciona variant fantasma ao cart via `cartLinesAdd`
9. Total no resumo já inclui frete (vem do Shopify `cart.cost.totalAmount`)
10. Cliente clica "Ir para o Checkout"
11. `handleCheckout` chama `setCartAttributes(cartId, [{key:'delivery_method',value:'uber_direct'}, {key:'uber_quote_id',value:'...'}])`
12. Redirect para checkout Shopify com cart pronto

### Cliente com cart ≥ 7 marmitas

1. Cliente adiciona 7+ marmitas (típico: monta Kit Livre ou compra Kit temático)
2. CartDrawer mostra "Frete grátis pela frota Jilo. Entrega em até 48h." (a promessa de 48h via `DELIVERY_PROMISE_LABEL` aparece nos dois ramos do CartDrawer — grátis e <7)
3. Em `/carrinho`, `<ShippingMethodSelector />` mostra "Entrega Jilo • Frete grátis"
4. Se variant fantasma estava no cart (cliente adicionou marmitas adicionais cruzando o threshold), `<ShippingMethodSelector />` remove ela automaticamente
5. Cliente vai pro checkout, `setCartAttributes` grava `{key:'delivery_method',value:'jilo_own'}`

### Backend após pagamento (orders/paid webhook)

1. Shopify dispara `orders/paid` para `shopify-webhook-receiver`
2. HMAC validado, idempotência checada
3. Handler de `orders/paid`:
   - Conta `totalNonShippingItems` filtrando variant fantasma do `payload.line_items`
   - Decide `delivery_method` baseado em `>= SHIPPING_FREE_THRESHOLD`
   - Lê `delivery_method` e `uber_quote_id` de `payload.note_attributes`
   - Calcula `shipping_fee_cents` somando preço × quantity da variant fantasma
   - Atualiza `orders` com esses campos + `delivery_status` inicial (`pending_dispatch` ou `jilo_pending`)
4. Se `uber_direct` + tem quote, dispara fire-and-forget para `uber-create-delivery`
5. `uber-create-delivery` valida e chama `POST /v1/customers/{id}/deliveries`
6. Atualiza `orders` com `uber_delivery_id`, `uber_tracking_url`, `delivery_status='uber_pickup_assigned'`

### Webhooks Uber

1. Uber envia `event.delivery_status` para `uber-webhook-receiver`
2. Edge registra em `webhook_events` (idempotência por `external_id="${deliveryId}:${uberStatus}"`)
3. Mapeia status Uber → enum `delivery_status` interno
4. Atualiza `orders` via `uber_delivery_id`

## Integrações

| Integração | Tipo | Usado em |
|---|---|---|
| Uber Direct OAuth | `POST https://auth.uber.com/oauth/v2/token` (scope `eats.deliveries`, token vale 30 dias) | `uber-quote`, `uber-create-delivery` (cache de token por isolate) |
| Uber Direct quotes | `POST /v1/customers/{id}/delivery_quotes` | `uber-quote` |
| Uber Direct deliveries | `POST /v1/customers/{id}/deliveries` | `uber-create-delivery` |
| Uber Direct webhooks | Cadastrar URL no painel Uber | `uber-webhook-receiver` |
| Shopify Admin GraphQL | `productVariantsBulkUpdate` | `update-shipping-variant-price` |
| Shopify Storefront | `cartAttributesUpdate` | `setCartAttributes` (frontend) |

## Gotchas e armadilhas

- Produto fantasma `status: ACTIVE` + publicado no Online Store (Sprint 5.0, R54). Como ACTIVE é visível em listagens, é mantido fora do catálogo por **filtro de tag** (`-tag:__internal_shipping` via `excludeInternalShipping()`) em TODA query `PRODUCTS_QUERY`, além da filtragem visual no cart (`Carrinho.tsx`, `CartDrawer.tsx`). NÃO usar DRAFT nem UNLISTED — ambos somem da Storefront (variant não-vendável). A root cause original do bug de 5 sprints era publicação ausente no Online Store (estava só no Point of Sale).
- `cartStore` persiste a variant fantasma no localStorage. Em refresh o `<ShippingMethodSelector />` re-sincroniza no primeiro render.
- A Shopify Admin API **não tem `productVariantUpdate` singular** — sempre `productVariantsBulkUpdate`, mesmo para 1 variant.
- Preço para Shopify GraphQL é string com 2 decimais (`"14.90"`), não número.
- Token Uber tem TTL de **30 dias** (não 1h — confirmado na doc oficial). Cacheado por isolate Deno. Cold start refaz auth (~50ms extras). Rate limit do auth: 100 req/hour — irrelevante com cache.
- **URL oficial de auth: `https://auth.uber.com/oauth/v2/token`** (NÃO `login.uber.com` — esse é endpoint de outras APIs Uber). Scope único: `eats.deliveries`. Auth funciona igual em sandbox e produção.
- A diferença entre sandbox e produção é **apenas** no `UBER_API_BASE`: sandbox `https://sandbox-api.uber.com`, produção `https://api.uber.com`. Validar no painel Uber se conta está em "Test mode" antes de cadastrar como produção.
- Quote Uber tem TTL 15min, frontend usa `staleTime` 14min. Se cliente demora demais, query refaz.
- Validação defensiva no `update-shipping-variant-price`: `0 < fee_cents <= 100000` (R$ 1000 max). Previne abuso.
- Cliente pode burlar frete via console (zerar preço antes do `cartLinesAdd`). Mitigação: sprint futura validar no webhook se `shipping_fee_cents` bate com cotação Uber re-confirmada.
- Webhook Uber NÃO valida HMAC ainda — débito de segurança em `state.md`.
- `uber-create-delivery` é fire-and-forget pelo `shopify-webhook-receiver` — webhook Shopify tem timeout ~5s, await atrasaria resposta.
- Sprint futura: UI admin para `delivery_status='jilo_pending'` (≥ 7 marmitas, despache manual).
- Trigger `orders_log_status_change` dispara em UPDATE de `orders.status` — quando `orders/paid` muda status para `paid`, alimenta timeline. `delivery_status` é independente e não dispara trigger nenhum.
- O CHECK em `orders.delivery_method` aceita NULL — orders antigas (pré-feature) ficam com NULL.
- Custom App Shopify tem token único compartilhado entre `shopify-customer-sync` e `update-shipping-variant-price`. Reinstalar invalida ambos — cuidado em rotação.
- **Variant fantasma é singleton (R50):** Sempre `quantity = 1` no cart. Re-adicioná-la quando já existe NÃO soma quantity — `cartStore.addItem` detecta `isShippingVariant(variantId)` e faz REPLACE atômico (remove linha antiga + cria nova com preço atualizado). Se aparecer no Shopify Admin → Active carts qualquer carrinho com 2+ linhas da variant fantasma, é regressão do bug corrigido em Sprint 4.5 — checar `cartStore.ts` e `ShippingMethodSelector.tsx`.
- **Cleanup defensivo no mount do `<ShippingMethodSelector />`:** O componente roda uma checagem one-shot no primeiro render que detecta variant fantasma local com `quantity > 1` e a remove antes de sincronizar. Protege clientes que estavam em produção durante o bug de Sprint 4.5. Reset via `lastSyncedFeeRef.current = null` força re-sincronização limpa.
- **NÃO usar `updateQuantity` para mudar preço da variant fantasma:** Shopify identifica a linha por `lineId` mas o preço vem da variant. Mudar preço exige `update-shipping-variant-price` (server-side, via GraphQL Admin) + remove+add no cart (client-side). `updateShopifyCartLine` só ajusta quantity, não recarrega preço.
- **Identidade referencial em props de `<ShippingMethodSelector />` (R50.1):** O componente faz sincronização via `useEffect` com debounce 300ms. Se o `deliveryCheck` recebido como prop for um objeto novo a cada render do pai (`Carrinho.tsx`), o effect entra em loop de cancellation e o `setTimeout(sync, 300)` nunca completa — variant fantasma nunca entra no cart Shopify. O `cepParams` derivado internamente é memoizado via `useMemo` com chaves primitivas do `deliveryCheck.cepInfo` (cep, logradouro, localidade, uf). O `<DeliveryAddressSelector />` (fonte do `deliveryCheck`) também memoiza seu `CepValidationResult` derivado. Defesa em duas camadas. Sprint 4.6 (Maio 2026) introduziu essa correção após regressão da Sprint 4.5.
- **Diagnóstico defensivo no `<ShippingMethodSelector />`:** O effect de sync mantém `cancelCountRef` que conta cancellations consecutivas SEM sync completar. Se cruzar 5, dispara `console.warn` em qualquer ambiente (PROD ou DEV) avisando "Effect re-render loop detectado". Em DEV, há também warning adicional quando o effect re-roda sem nenhuma dep primitiva ter mudado (sinal de regressão de memoização). Esse logging é o canário pra detectar futuras regressões dessa natureza antes de afetar a experiência do cliente em produção. Se aparecer no console em ambiente real, investigar deps do useEffect imediatamente.
- **REPLACE atômico (R50) é mais lento que update simples:** O `cartStore.addItem` para variant fantasma faz 2 chamadas Shopify em série (remove + add). Isso tornou o `sync()` mais sensível a cancellations do `setTimeout` — qualquer re-render do `<ShippingMethodSelector />` que reset o effect durante esses ~400-800ms (latência Shopify) impede a variant de entrar. Por isso a memoização das deps é crítica. Não trocar o REPLACE por updateQuantity (que seria mais rápido) — a regra R50 do singleton exige REPLACE pra atualizar o preço da variant.

- **NUNCA voltar a usar `SHOPIFY_ADMIN_ACCESS_TOKEN` como secret estático.** A Shopify migrou pro Dev Dashboard novo e deprecou a entrega direta de `shpat_` permanente. Toda chamada à Admin API agora precisa passar pelo helper `_shared/shopify-admin-auth.ts` que faz Client Credentials Grant. Se aparecer alguém querendo "simplificar" voltando ao token estático, recusar — o secret antigo expirou silenciosamente em produção e travou a feature de frete (Sprint 4.7).

- **Token `atkn_` do Dev Dashboard NÃO é admin token.** O `atkn_` que aparece em "Token de automação de app" no Settings do Dev Dashboard é um **App Automation Token** — serve APENAS pra autenticar o Shopify CLI em pipelines CI/CD (`SHOPIFY_APP_AUTOMATION_TOKEN` env var pra `shopify app deploy`). Ele NÃO funciona como `X-Shopify-Access-Token` em chamadas pra GraphQL Admin API. Se Claude Code ou outra IA confundir, refresh sua memória sobre as duas categorias.

- **Cache do `shpat_` está na tabela `shopify_admin_tokens` (1 row sempre).** Não fazer SELECT direto pra debugar — usar SQL Editor com service_role. Coluna `access_token` é sensível (token raw). Se precisar invalidar manualmente (ex: comprometimento de credenciais), DELETAR a row — o próximo `getShopifyAdminToken()` faz refresh automaticamente. Não fazer UPDATE manual no token.

- **Edges com retry em 401:** as edges `update-shipping-variant-price` e `shopify-customer-sync` têm retry automático quando Shopify retorna 401 (chama `forceRefreshShopifyAdminToken()` e tenta 1 vez mais). Cenário coberto: token cached foi revogado server-side (raro, mas acontece em rotação manual de client_secret). Se aparecer log `[xxx] Got 401, forcing token refresh and retrying` em produção, é normal — investigar só se for recorrente (sinal de outro problema).

- **Hard-block do checkout (R52, Sprint 4.7):** Mesmo com a variant fantasma sincronizando perfeitamente, o `Carrinho.tsx` valida defesa em profundidade: `Math.abs(shopifyTotal - (subtotal + activeShippingFeeCents/100)) < 0.01`. Se em algum momento o frontend acha que o cart tem frete (`activeQuoteId !== null`) mas o Shopify não tem (variant fantasma não entrou), o botão de checkout fica disabled exibindo "Sincronizando frete...". Console emite warning. Esse é o catch-net pra quando o `update-shipping-variant-price` falha (token issue, network, etc).

- **Produto fantasma precisa de ACTIVE + publicação no Online Store (R54, Sprint 5.0):** A causa raiz do bug que travou 5 sprints (variant "aparecia entrar no Cart mas não entrava") foi **publicação ausente no sales channel**: o produto estava só no "Point of Sale", não no "Online Store" (canal do token Storefront). Disponibilidade via Storefront = publicação no sales channel, ortogonal ao status. **Atenção:** a hipótese de que `UNLISTED` resolveria foi TESTADA E REFUTADA — com UNLISTED + publicado no Online Store, a variant ainda retornava `node: null` na Storefront em todas as versões (2025-07/10/01/unstable). Só `status: ACTIVE` + publicado funcionou. Validação rápida no Console: `query($id:ID!){node(id:$id){...on ProductVariant{availableForSale}}}` deve retornar `true`. Se retornar `null`/`false`: verificar no Admin (a) status = ACTIVE e (b) produto publicado no Online Store (`publishablePublish`).

- **Verificação pós-add no `cartStore` (R55, Sprint 5.0):** Quando `addItem` é chamado com `isShippingVariant(variantId) === true`, há uma segunda chamada à Shopify (`fetchCartFull`) após o `addLineToShopifyCart` retornar sucesso, pra confirmar que a linha realmente entrou. Adiciona ~200-400ms à operação mas protege contra falhas silenciosas. Se a verificação falhar, o erro `[cartStore] CRITICAL: Storefront returned success for cartLinesAdd of shipping variant, but the line is NOT in the cart after re-fetch` aparece no Console com payload de diagnóstico. Em produção, esse log é canário de regressão — investigar imediatamente.

- **⚠️ Edge `set-product-unlisted` está OBSOLETA e NÃO deve ser rodada:** ela seta `status: UNLISTED`, que (verificado na Sprint 5.0) torna a variant invisível na Storefront → **re-quebra o carrinho**. Foi criada sob a hipótese refutada de que UNLISTED resolveria o bug. Decisão pendente: deletar OU repropô-la como "set ACTIVE + `publishablePublish` no Online Store" — que é o que um ambiente novo (staging) realmente precisa pra ativar a feature de frete.
