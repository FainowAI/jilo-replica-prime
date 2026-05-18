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
- R19. Desconto PIX5 via cupom Shopify ao selecionar PIX no PaymentMethodSelector

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
