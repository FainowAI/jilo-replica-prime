PROMPT 11 (FINAL) — Atualizar documentação .claude/
Contexto
Após implementar a feature de frete Uber Direct condicional, atualize a documentação do projeto em .claude/ para refletir as mudanças. Este prompt é obrigatório — sem ele, sessões futuras de Claude Code não terão contexto correto e podem reintroduzir as regras antigas (frete sempre grátis).
Tarefa
Atualize 5 arquivos na pasta .claude/:
11.1 CRIAR .claude/fluxo-uber-direct.md
Crie o arquivo com este conteúdo:
markdown# Fluxo: Frete Uber Direct condicional

## Visão geral

Frete cobrado em real-time via Uber Direct quando o cart tem menos de 7 marmitas. A partir de 7, frete grátis (entrega Jilo, despachada manualmente em sprint futura).

A loja Jilo está em plano Shopify que não suporta Shipping Rates condicionais por quantidade e a estratégia foi NÃO usar apps de terceiros nem fazer upgrade. Em vez disso, criamos um produto fantasma no Shopify ("Frete Uber Direct", `status: draft`, tag `__internal_shipping`) cujo preço é atualizado em real-time via Admin GraphQL e adicionado ao cart como uma linha normal. Como produtos `draft` são invisíveis ao Storefront API, a variant fantasma só aparece dentro do cart, nunca em listagens.

## Arquivos envolvidos

### Config
| Arquivo | Descrição |
|---------|-----------|
| `src/config/shipping.ts` | Constantes de frete: `SHIPPING_FREE_THRESHOLD = 7`, `SHIPPING_VARIANT_ID` (do .env), helpers `getDeliveryMethod`, `isFreeShipping`, `isShippingVariant` |
| `supabase/functions/_shared/shipping-constants.ts` | Constantes equivalentes para uso em Edge Functions Deno (manter sincronizado com `src/config/shipping.ts`) |

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

**Pickup Jilo:**
| Nome | Origem |
|------|--------|
| `JILO_PICKUP_NAME` | `Jilo Marmitas` |
| `JILO_PICKUP_PHONE` | `+5512988950426` (E.164) |
| `JILO_PICKUP_ADDRESS_JSON` | JSON com endereço da cozinha |
| `JILO_PICKUP_LATITUDE` | Decimal |
| `JILO_PICKUP_LONGITUDE` | Decimal |

**Custom App scopes obrigatórios:** `write_customers` (existente), `read_customers` (opcional), `write_products` (novo), `read_products` (opcional).

## Regras de negócio

Vide `.claude/requirements.md` regras R34 a R44.

## Fluxo do usuário

### Cliente com cart < 7 marmitas

1. Cliente adiciona marmitas ao cart (CartDrawer abre)
2. CartDrawer mostra "Frete grátis a partir de 7 marmitas (faltam X)"
3. Cliente vai para `/carrinho`
4. Resumo do pedido mostra `<CepChecker />` + aviso "Verifique antes de finalizar"
5. Cliente verifica CEP → resultado positivo dispara `<ShippingMethodSelector />`
6. `useShippingQuote` chama edge `uber-quote` → recebe `{quote_id, fee_cents}`
7. `<ShippingMethodSelector />` exibe "Entrega Uber Direct • R$ X • Entrega em ~Ymin"
8. Em paralelo, sincroniza variant fantasma no Shopify Cart (debounce 300ms):
   - Chama edge `update-shipping-variant-price` com `fee_cents`
   - Adiciona variant fantasma ao cart via `cartLinesAdd`
9. Total no resumo já inclui frete (vem do Shopify `cart.cost.totalAmount`)
10. Cliente clica "Ir para o Checkout"
11. `handleCheckout` chama `setCartAttributes(cartId, [{key:'delivery_method',value:'uber_direct'}, {key:'uber_quote_id',value:'...'}])`
12. Redirect para checkout Shopify com cart pronto

### Cliente com cart ≥ 7 marmitas

1. Cliente adiciona 7+ marmitas (típico: monta Kit Livre ou compra Kit temático)
2. CartDrawer mostra "Frete grátis — entrega Jilo em até 48h"
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

- Produto fantasma `status: draft` é INVISÍVEL ao Storefront API — não aparece em `PRODUCTS_QUERY`, `COLLECTION_BY_HANDLE_QUERY`. Filtragem `__internal_shipping` necessária APENAS na lista visual do cart (`Carrinho.tsx`, `CartDrawer.tsx`).
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
11.2 ATUALIZAR .claude/requirements.md
Localize a seção "Carrinho e checkout (já existia)" e substitua R16 e R17. Antes:
markdown### Pedidos
- R13. Pedidos são read-only na área do cliente
- R14. Escrita de pedidos é exclusiva do service_role (webhook Shopify)
- R15. Timeline de status é populada automaticamente via trigger
- R16. Frete é sempre grátis (cortesia Jilo — regra R20 do carrinho)
Mudar para:
markdown### Pedidos
- R13. Pedidos são read-only na área do cliente
- R14. Escrita de pedidos é exclusiva do service_role (webhook Shopify)
- R15. Timeline de status é populada automaticamente via trigger
- R16. ~~Frete sempre grátis~~ Atualizado em 2026-04-29 pela feature Uber Direct: frete varia conforme quantidade. Vide R34.
E na seção "Carrinho e checkout (já existia)", substitua R17:
markdown## Carrinho e checkout (já existia)
- R17. ~~Frete sempre grátis~~ Atualizado em 2026-04-29 pela feature Uber Direct: frete grátis a partir de 7 marmitas, abaixo disso cliente paga via Uber Direct. Vide R34.
- R18. Checkout redirect para Shopify
- R19. Desconto PIX5 via cupom Shopify ao selecionar PIX no PaymentMethodSelector
Adicione ao final do arquivo (depois de R33):
markdown## Frete Uber Direct condicional (Sprint 4.1, Abril 2026)

- **R34.** Threshold de frete grátis = **7 marmitas**. Abaixo disso, cliente paga frete via Uber Direct cotado em real-time. Constante definida em `src/config/shipping.ts` (`SHIPPING_FREE_THRESHOLD`) e replicada em `supabase/functions/_shared/shipping-constants.ts` — manter sincronizado em ambos.
- **R35.** Cotação Uber válida por 15min. Frontend usa `staleTime` 14min via TanStack Query. queryKey inclui CEP + total de itens.
- **R36.** Criação efetiva da entrega Uber acontece via edge `uber-create-delivery`, chamada pelo `shopify-webhook-receiver` no evento `orders/paid`. Nunca pelo frontend, nunca antes do pagamento confirmado.
- **R37.** Para `delivery_method = 'jilo_own'` (≥ 7 itens), nenhuma chamada à Uber. Order fica `delivery_status = 'jilo_pending'` aguardando dispatch manual (sprint futura terá UI admin).
- **R38.** Toda chamada à API Uber e Admin API Shopify é server-side via Edge Function. Credenciais ficam apenas nos Edge Function Secrets (nunca em código frontend nem em variáveis públicas).
- **R39.** Produto fantasma "Frete Uber Direct" tem handle `frete-uber-direct`, tag `__internal_shipping`, status `draft` no Shopify. variantId guardado em `VITE_SHOPIFY_SHIPPING_VARIANT_ID` (frontend) e `SHOPIFY_SHIPPING_VARIANT_ID` (Edge Function Secret). Como `status: draft`, NÃO aparece em queries Storefront — só dentro do cart quando adicionado via `cartLinesAdd`.
- **R40.** UI filtra a variant fantasma das listas visuais em `Carrinho.tsx` e `CartDrawer.tsx` via `useVisibleCartItems`. Selector `useNonShippingTotalItems` aplica essa filtragem para a regra de threshold (R34).
- **R41.** Variant fantasma só entra no cart se cliente verificou CEP atendido (resultado positivo do `<CepChecker />`). Sem CEP validado, `<ShippingMethodSelector />` não cota nem adiciona variant.
- **R42.** Quando cliente cruza o threshold de 7 itens (subindo ou descendo), `<ShippingMethodSelector />` remove ou (re)adiciona a variant fantasma com debounce 300ms para evitar race com Shopify Cart API.
- **R43.** No webhook `orders/paid`, `shipping_fee_cents` é extraído do line_item da variant fantasma (filtrando `variant_id === SHIPPING_VARIANT_ID`), não do `total_shipping_price_set` do payload Shopify (que sempre vem 0 por não termos shipping rate configurado).
- **R44.** Webhook Uber registrado em `webhook_events` com `source='uber_direct'`. Idempotência por `external_id` que inclui o status do evento (`"${deliveryId}:${uberStatus}"`).
11.3 ATUALIZAR .claude/fluxo-carrinho-checkout.md
Substituir a regra 7 (que diz "Frete SEMPRE grátis"):
markdown7. **Frete condicional via Uber Direct (Sprint 4.1)**: Frete varia conforme quantidade de marmitas. **< 7 marmitas**: cliente paga frete cotado em real-time via Uber Direct (`<ShippingMethodSelector />` no resumo do `/carrinho`). **≥ 7 marmitas**: frete grátis (entrega Jilo). Veja `.claude/fluxo-uber-direct.md` para detalhes técnicos completos.
Substituir o gotcha que menciona FREE_SHIPPING_THRESHOLD foi removido:
markdown- `FREE_SHIPPING_THRESHOLD` foi reintroduzido em `src/config/shipping.ts` como `SHIPPING_FREE_THRESHOLD = 7` para a feature Uber Direct (Sprint 4.1). Use o helper `isFreeShipping(totalNonShippingItems)` em vez de comparações ad-hoc.
Adicionar ao final da seção "Constantes de negócio":
markdown| `SHIPPING_FREE_THRESHOLD` | 7 marmitas | `src/config/shipping.ts` (Sprint 4.1) |
| Frete < 7 itens | Cotado real-time via Uber Direct | `<ShippingMethodSelector />` em `/carrinho` |
| Frete ≥ 7 itens | Grátis (entrega Jilo) | Mesmo componente, mensagem diferente |
Adicionar ao final da tabela "Arquivos envolvidos" → "Componentes":
markdown| `src/components/ShippingMethodSelector.tsx` | UI de seleção de frete no resumo do `/carrinho`. Sincroniza variant fantasma no cart Shopify automaticamente. Vide `.claude/fluxo-uber-direct.md` |
11.4 ATUALIZAR .claude/fluxo-shopify-sync.md
Adicionar ao final da seção "Webhook de pedidos e entrega":
markdown7. **Sprint 4.1 (frete Uber Direct):** O handler de `orders/paid` foi estendido para popular `delivery_method`, `uber_quote_id`, `shipping_fee_cents` e `delivery_status`. Lê `note_attributes` do payload Shopify (gravados pelo frontend via `cartAttributesUpdate` antes do redirect). Se `delivery_method='uber_direct'` e tem quote, dispara fire-and-forget para edge `uber-create-delivery` que efetivamente cria a delivery na Uber. Vide `.claude/fluxo-uber-direct.md`.
Adicionar à tabela "Env vars necessárias":
markdown| `SHOPIFY_SHIPPING_VARIANT_ID` | `gid://shopify/ProductVariant/...` | Saída de `npm run setup:shipping` |
| `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`, `UBER_CUSTOMER_ID`, `UBER_API_BASE` | (vide painel Uber Direct) | Edges Uber |
| `JILO_PICKUP_*` | (endereço/lat/lng/telefone) | Edges Uber |
Atualizar a linha de scopes:
markdown**Escopo da Custom App:** o token em uso (`***SHPAT_REDACTED***` — rotacionar antes do go-live) é um app "full access" com 178 scopes ativos, incluindo `write_customers`, `read_customers`, `write_products`, `read_products`, `write_orders`, `read_orders`. Validado em 2026-04-29 contra `currentAppInstallation.accessScopes`. Se o token for revogado/rotacionado, o substituto precisa manter pelo menos esses scopes.
Adicionar gotcha sobre nomes de variável:
markdown- **O mesmo token de Admin Shopify vive em dois nomes de variável diferentes:** `SHOPIFY_ADMIN_TOKEN` no `.env` local (lido pelos scripts Node — `seed-products.ts`, `setup-shipping-variant.ts`, `generate-seo-files.ts`) e `SHOPIFY_ADMIN_ACCESS_TOKEN` nos Edge Function Secrets (lido pelas edges Deno — `shopify-customer-sync`, `update-shipping-variant-price`). NÃO unificar — renomear quebra integrações em produção.
- **`SHOPIFY_STORE_DOMAIN`** funciona com o domínio técnico (`jnutg9-u2.myshopify.com`) ou com o alias amigável (`jilo-marmitas.myshopify.com`). Manter `jnutg9-u2.myshopify.com` nas Edge Functions por consistência (esse não muda mesmo se a loja trocar de slug).
11.5 ATUALIZAR .claude/state.md
Substitua a seção "Última atualização" e "O que foi feito na última sessão" por:
markdown## Última atualização
2026-04-29 (Sprint 4.1 — frete Uber Direct condicional)

## O que foi feito na última sessão (Sprint 4.1 — Frete Uber Direct)

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
- **Sprint 4.1 (2026-04-29)** — Frete Uber Direct condicional (esta sessão)
Substitua a seção "Pendências" por:
markdown## Pendências

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
Substitua "Próximos passos planejados":
markdown## Próximos passos planejados

Sprint 4.2 — endurecimento Uber:
1. Validação HMAC no `uber-webhook-receiver`
2. Validação server-side de `shipping_fee_cents` no `shopify-webhook-receiver`
3. Painel admin para `jilo_pending` orders (UI mínima em `/conta/admin` ou similar)

Sprint 4 (resto):
1. Migrar webhook receiver de `line_items` jsonb para `order_items` normalizado
2. Lookup de `user_id` por email
3. Webhook `customers/update`
4. Integração Bling ERP
Adicione à seção "Notas para a próxima sessão":
markdown- **Frete Uber Direct está em produção (Sprint 4.1)** — qualquer mudança no threshold de 7 marmitas exige editar `src/config/shipping.ts` E `supabase/functions/_shared/shipping-constants.ts` (manter sincronizados)
- O produto fantasma "Frete Uber Direct" no Shopify Admin tem `status: draft` propositalmente — NÃO publicar
- O Custom App Shopify usa um token de "full access" (178 scopes, incluindo `write_products`). Token atual `***SHPAT_REDACTED***` — se for revogado/rotacionado, substituto precisa manter pelo menos `write_customers`, `write_products`, `read_orders`, `write_orders`. Atualizar em DOIS lugares: `.env` local (`SHOPIFY_ADMIN_TOKEN`) e Edge Function Secrets (`SHOPIFY_ADMIN_ACCESS_TOKEN`) — nomes diferentes, mesmo valor.
- Se Uber lançar API nova ou mudar payload de webhook, ajustar `UBER_STATUS_MAP` em `uber-webhook-receiver/index.ts`
- Edges chamadas server-to-server (`uber-create-delivery`) são deployadas com `--no-verify-jwt` e validam o `Authorization: Bearer <service_role>` manualmente
- **URL de auth da Uber é `auth.uber.com/oauth/v2/token`** (validado contra doc oficial em 2026-04-29). Scope único: `eats.deliveries`. Token vale 30 dias.
- **Customer ID Uber:** o que aparece no painel como "ID do usuário" (formato UUID) é o que vai nas URLs `/v1/customers/{customer_id}/...`. NÃO confundir com `client_id` (OAuth)
- **Débito de operação:** o `client_secret` cadastrado precisa ser confirmado contra o painel Uber Direct. Se foi rotacionado depois do compartilhamento inicial, atualizar o secret no Supabase
- Antes do go-live, validar se as credenciais Uber são de sandbox ou produção. No painel: aviso azul "Test mode" no topo = sandbox. Sem aviso = produção.
IMPORTANTE — Não quebre o que já funciona

NÃO remova documentação dos outros fluxos (fluxo-autenticacao.md, fluxo-catalogo-produtos.md, fluxo-kits.md, fluxo-perfil-usuario.md, fluxo-seo-geo.md, fluxo-validacao-cep.md)
NÃO renumere as regras existentes em requirements.md. R16 e R17 ficam marcadas com tachado e nota de atualização — mas o número fica.
NÃO apague a seção "Histórico de sprints" — apenas adiciona o Sprint 4.1
Escreva tudo em português brasileiro
Os exemplos de código nos .md são em português brasileiro nos comentários (consistência com o resto do projeto)
O arquivo fluxo-uber-direct.md é NOVO — criar do zero. Os outros são EDITADOS.
Pendências do Sprint 4 (popular order_items, customers/update, Bling) não foram resolvidas nesta feature — manter na lista
Após este prompt, sugira ao usuário rodar codebase-cleanup se o sprint acumulou código órfão (improvável aqui — feature foi cirúrgica)