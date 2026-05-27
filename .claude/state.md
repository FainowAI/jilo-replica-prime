# Estado do projeto Jilo

## Última atualização
2026-05-27 (Sprint 4.5 — Fix variant fantasma duplicada no cart)

## O que foi feito na última sessão (Sprint 4.5 — Fix bug do frete duplicado)

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
