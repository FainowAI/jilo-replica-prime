# Estado do projeto Jilo

## Última atualização
2026-05-11 (Sprint 4.2 — Return URL no checkout Shopify)

## O que foi feito na última sessão (Sprint 4.2 — Return URL no checkout Shopify)

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
