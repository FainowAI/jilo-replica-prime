# Requisitos e regras de negócio — Jilo

## Área do cliente (Sprint 1, Abril 2026)

### Autenticação
- R1. Senha mínima: 6 caracteres
- R2. Login via e-mail + senha (sem magic link por enquanto)
- R3. Sessão persistente com auto-refresh
- R4. Signup cria profile vazio automaticamente via trigger DB

### Perfil
- R5. E-mail não é editável (vive em `auth.users`)
- R6. Todos os campos de perfil são opcionais exceto `id`
- R7. Sem validação de CPF (débito técnico)
- R8. `shopify_customer_id` é preenchido pela Edge Function, nunca pelo usuário

### Endereços
- R9. Um único endereço padrão por usuário (garantido por trigger + índice parcial)
- R10. CEP no formato `^[0-9]{5}-?[0-9]{3}$` (CHECK no DB)
- R11. UF sempre 2 caracteres uppercase (CHECK no DB)
- R12. `profiles.default_shipping_address_id` é cache do endereço com `is_default = true`

### Pedidos
- R13. Pedidos são read-only na área do cliente
- R14. Escrita de pedidos é exclusiva do service_role (webhook Shopify)
- R15. Timeline de status é populada automaticamente via trigger
- R16. ~~Frete sempre grátis~~ Atualizado em 2026-04-29 pela feature Uber Direct: frete varia conforme quantidade. Vide R34.

### Sincronização Shopify (Sprint 2)
- R23. Cada profile no Supabase tem exatamente 1 customer correspondente no Shopify, identificado pelo email
- R24. O campo `shopify_customer_id` só é preenchido pela edge function `shopify-customer-sync` — nunca pelo usuário, nunca pelo frontend direto
- R25. Usuário não autenticado NÃO pode finalizar compra — o botão de checkout em `/carrinho` abre modal de signup se `user === null`
- R26. Falha de sync Shopify NÃO bloqueia a UX — o perfil é salvo normalmente, erro vai só pro console
- R27. Sync é idempotente via argumento `identifier: { emailAddress }` na mutation `customerCreate`

## Carrinho e checkout (já existia)
- R17. ~~Frete sempre grátis~~ Atualizado em 2026-04-29 pela feature Uber Direct: frete grátis a partir de 7 marmitas, abaixo disso cliente paga via Uber Direct. Vide R34.
- R18. Checkout redirect para Shopify
- **R19.** Desconto PIX é condicional à quantidade de marmitas no carrinho (regra de combinabilidade com Automatic Discounts):
  - **<7 marmitas:** aplica cupom `PIX5` (5% off). Cupom marcado como NÃO combinável no Shopify Admin.
  - **≥7 marmitas:** aplica cupom `PIX3` (3% off). Cupom marcado como combinável com "Descontos de produto", permitindo acumular com o Kit 7/14/21/28 (10%/15%/20%/25%) ativo. A taxa menor (3% vs 5%) preserva margem do Jilo nos pedidos maiores.
  - **Troca automática ao cruzar threshold:** se cliente está com PIX selecionado e cruza ≥7 (subindo) ou <7 (descendo), o `<PaymentMethodSelector />` troca o cupom no Shopify Cart API automaticamente, mantendo a seleção PIX do usuário. Threshold = `SHIPPING_FREE_THRESHOLD` (mesma constante do Uber Direct — R34).
  - **Diagnóstico de erro:** quando `applicable=false` retorna do Shopify Cart API em qualquer cenário, o componente loga `console.error` com payload completo do cart (cupom tentado, totalNonShippingItems, discountCodes atuais, resultado).
  - **Pré-requisito Shopify Admin:** ambos os cupons devem existir e estar ativos. `PIX3` foi criado no Sprint 4.4 com as mesmas 26 marmitas elegíveis que o PIX5.

## Infraestrutura
- R20. Todas as tabelas com escopo de usuário têm RLS ativo filtrado por `auth.uid()`
- R21. Service role usado apenas server-side (webhooks, Edge Functions)
- R22. Anon key hardcoded em `client.ts` (débito de segurança — migrar para .env)

## SEO e GEO (Sprint 3, Abril 2026)

- **R28.** O sitemap.xml só inclui rotas públicas. Rotas autenticadas (`/conta/*`, `/carrinho`, `/login`, `/cadastro`) são explicitamente excluídas do sitemap e têm `Disallow` no robots.txt para o User-agent `*`
- **R29.** Arquivos SEO/GEO (`sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt`) são gerados automaticamente via hook `prebuild` e comitados no repositório. Nunca editar manualmente — rodar `npm run seo` para regenerar
- **R30.** A URL canônica do site vem da env var `SITE_URL` com fallback para `https://jilomarmitas.com`. Qualquer link absoluto em SEO/GEO usa essa fonte única
- **R31.** O `index.html` é o shell servido a crawlers que não executam JavaScript (Googlebot em primeira passada, Facebookbot, Twitterbot, AI bots). Todas as meta tags críticas de SEO/OG/Twitter Cards DEVEM estar estaticamente no `<head>` — não podem depender de `react-helmet` ou injeção em runtime para o conteúdo global (home/root). Meta tags por rota podem usar helmet, mas as do `index.html` continuam como fallback
- **R32.** A og:image e o favicon DEVEM ser hospedados no próprio domínio (`public/`). Nunca referenciar assets do CDN `storage.googleapis.com/gpt-engineer-file-uploads` (CDN temporário da Lovable, sujeito a expiração)
- **R33.** Todo asset binário de SEO visual (favicon.ico, PNGs de ícone, apple-touch-icon, og-image) vive em `public/` e é versionado no Git. Nunca em `src/assets` (seria referenciado via import do bundler e não estaria acessível diretamente por URL para crawlers)

## Frete Uber Direct condicional (Sprint 4.1, Abril 2026)

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
- **R50.** A variant fantasma `__internal_shipping` (R39) é **singleton** no cart Shopify: sempre `quantity = 1` por design. Quando a cotação Uber Direct muda durante a sessão (cliente troca endereço, edita CEP, ou cotação re-cota após expiração de 15min), a sincronização DEVE ser REPLACE atômico — `removeLineFromShopifyCart` seguido de `addLineToShopifyCart` — nunca `updateShopifyCartLine` ou soma de `quantity`. Garantia em duas camadas: (a) `cartStore.addItem` detecta `isShippingVariant(variantId)` e faz remove+add atômico em vez do branch padrão de soma de quantity (que vale apenas para marmitas, R5). (b) `<ShippingMethodSelector />` faz cleanup defensivo no mount: se encontrar linha local com `quantity > 1` (estado bugado herdado do localStorage), remove antes de sincronizar. Sprint 4.5 (Maio 2026) introduziu essa regra para corrigir bug onde o total exibido no `/carrinho` somava o frete múltiplas vezes (cotações antigas + nova permaneciam no Shopify Cart simultaneamente).

- **R51.** A autenticação com Shopify Admin API usa OAuth 2.0 Client Credentials Grant (não mais token estático `shpat_` permanente). Razão: a Shopify migrou pro Dev Dashboard novo em Dec 2025 e deprecou a entrega direta de `shpat_` no painel. O `shpat_` agora é gerado dinamicamente via `POST https://{shop}.myshopify.com/admin/oauth/access_token` com `grant_type=client_credentials`, `client_id` e `client_secret`, expira em 24h (86399s). O helper `supabase/functions/_shared/shopify-admin-auth.ts` centraliza essa lógica: cacheia o token na tabela `public.shopify_admin_tokens` (RLS bloqueada, apenas service_role lê/escreve), faz refresh quando `expires_at - now() < 1h`, e em caso de 401 da Shopify faz `forceRefreshShopifyAdminToken()` + 1 retry. Edge Functions afetadas: `update-shipping-variant-price` e `shopify-customer-sync` (não confundir com `shopify-webhook-receiver` que NÃO chama Admin API — apenas valida HMAC). Secrets necessários no Supabase: `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET` (substituindo `SHOPIFY_ADMIN_ACCESS_TOKEN`). Token `atkn_` da Dev Dashboard NÃO serve para Admin API — é app automation token, exclusivo para CI/CD via Shopify CLI.

- **R52.** O botão "Ir para o Checkout" em `/carrinho` valida hard-block que o `cartCost.totalAmount` retornado pelo Shopify bate matematicamente com `subtotal + activeShippingFeeCents` (tolerância de R$ 0,01). Sem essa validação, falha silenciosa na sincronização da variant fantasma (ex: edge `update-shipping-variant-price` retornando erro) permitiria avançar pro checkout com frete não cobrado — perda direta de receita. Quando `totalMatchesShopify === false`, o botão exibe "Sincronizando frete..." e fica disabled. `console.warn` é emitido pra alerta do time. Em frete grátis (≥ 7 marmitas), `activeShippingFeeCents = 0`, `expectedTotal = subtotal`, validação passa naturalmente.

- **R53.** O TOTAL exibido na página `/carrinho` é somatória LOCAL: `subtotal + (activeShippingFeeCents / 100)`. NÃO usa `cartCost.totalAmount` do Shopify. Razão: o `cartCost.totalAmount` (a) pode não incluir o frete quando a variant fantasma ainda não sincronizou no Shopify Cart, e (b) já vem com o desconto do cupom aplicado (ex: PIX5 = subtotal − 5%), e o desconto só deve aparecer no checkout Shopify — a UI comunica isso explicitamente ("Descontos aplicados no checkout Shopify"). Separação display vs cobrança: o display é somatória local; a COBRANÇA continua dependendo da variant fantasma estar no Shopify Cart (checkout nativo Shopify), e o `shopifyTotal` continua sendo usado pelo hard-block do `canCheckout` (R52) para validar a cobrança antes de liberar o checkout. Sprint 4.8 (Maio 2026).

- **R54.** O produto fantasma `__internal_shipping` (R39) deve estar com status `ACTIVE` **e publicado no sales channel "Online Store"** no Shopify Admin. Os dois requisitos são necessários e independentes:
  - **Publicação:** disponibilidade via Storefront API = publicação no sales channel do token Storefront (que é o "Online Store"), ortogonal ao status. O produto fantasma estava publicado só no "Point of Sale" — por isso `cartLinesAdd` da variant retornava erro explícito "A mercadoria … não existe" e `node()` retornava `null`, e a linha de frete nunca entrava no Cart.
  - **Status:** verificado empiricamente nesta loja (Sprint 5.0, via Playwright + Storefront/Admin API) — com `UNLISTED` + publicado no Online Store, a variant continuou retornando `node: null` no Storefront em **todas as versões testadas (2025-07/10/01/unstable)**. Só com `ACTIVE` + publicado é que `availableForSale: true` e o `cartLinesAdd` passou a funcionar (checkout liberou, TOTAL R$ 29,44, ponta a ponta). Portanto NÃO usar `DRAFT` nem `UNLISTED`. (Ressalva: não foi feito o teste reverso limpo ACTIVE→UNLISTED pós-propagação; o fato verificado é "UNLISTED+publicado retornou null nos testes", não "UNLISTED impossível em qualquer cenário".)
  - **Custo do ACTIVE:** o produto fica vendável e VISÍVEL em listagens. Por isso TODA query `PRODUCTS_QUERY` de catálogo DEVE excluir a tag via `excludeInternalShipping(query?)` (`src/lib/shopify.ts`) → injeta `-tag:__internal_shipping`. Call sites cobertos: `AllDishes`, `FullMenu`, `Favorites`, `KitLivre`, `Carrinho` (sugestões), `Product` (relacionados), `Collection`. A filtragem visual de `__internal_shipping` no carrinho (Carrinho/CartDrawer) continua valendo.
  - **Histórico:** a hipótese da Sprint 5.0 de que `UNLISTED` resolveria (edge `set-product-unlisted`) foi refutada. Essa edge ficou OBSOLETA — setar UNLISTED re-quebra o carrinho. Sprint 5.0 (Junho 2026).

- **R55.** O método `cartStore.addItem` deve fazer **verificação pós-add** apenas quando o item adicionado é a variant fantasma de frete (`isShippingVariant(variantId) === true`). Após `addLineToShopifyCart` retornar `success: true`, fazer `fetchCartFull` e confirmar que existe uma linha cujo `merchandise.id === item.variantId`. Se NÃO existir, logar `console.error` com payload de diagnóstico (cartId, variantId, contagem de lines, IDs das lines existentes), reverter o `items[]` local pra refletir a falha, e o hard-block do `canCheckout` (R52) impede o checkout naturalmente. Itens normais (marmitas, produtos ACTIVE) NÃO precisam dessa verificação. Defesa em profundidade contra regressões da publicação/status do produto fantasma (ex.: produto despublicado do Online Store, status revertido). Sprint 5.0.

## Domínio do checkout e return URL (Sprint 4.2, Maio 2026)

- **R45.** Em todo redirect pro checkout Shopify (`handleCheckout` em `Carrinho.tsx`, `handleBuyNow` em `Product.tsx`), o frontend DEVE:
  - (a) Gravar cart attribute `return_url = SITE_URL` via `setCartAttributes` (rastreabilidade no Admin como `note_attribute`).
  - (b) Enriquecer o `checkoutUrl` com `?return_to=<SITE_URL>` via `appendReturnToCheckoutUrl` (controla destino do botão "Continuar comprando" do checkout).
  - Fonte única do `SITE_URL`: `src/config/site.ts` (default `https://jilomarmitas.com`, override via `VITE_SITE_URL`).
  - Fail-silent: erro em `setCartAttributes` é logado no console mas NÃO bloqueia o checkout (R26).
  - O `CartDrawer` NÃO precisa desse tratamento porque navega para `/carrinho` (não vai direto pro Shopify).
  - Pré-requisito fora de código: domínio primário `checkout.jilomarmitas.com` configurado no Shopify Admin (Settings → Domains).

## Seletor de endereço no carrinho (Sprint 4.3, Maio 2026)

- **R46.** Cotação de frete e checkout em `/carrinho` exigem endereço selecionado da tabela `addresses`. Guest vê CTA de login (segue R25); logado sem endereço vê CTA de cadastro inline; logado com endereços vê lista de cards. Default (`is_default = true`, R12) é pré-selecionado.
- **R47.** Endereços com CEP fora da whitelist `DELIVERY_AREAS` aparecem na lista com badge "Não entregamos aqui" e radio desabilitado. Sort: entregáveis primeiro. Helper síncrono `isAreaDeliverable(uf, city)` em `src/lib/cepValidator.ts` é fonte única de checagem.
- **R48.** Cart attribute `selected_address_id` é gravado junto com `delivery_method`, `uber_quote_id` e `return_url` no `handleCheckout` (rastreabilidade no Shopify Admin + Bling ERP). Fail-silent (R26).
- **R49.** O componente `<CepChecker />` foi removido do `/carrinho` mas preservado no codebase para usos futuros (FAQ de cobertura, página de área atendida).
