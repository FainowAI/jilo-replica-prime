# Fluxo: Frete Uber Direct condicional

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
