# Fluxo: Carrinho e Checkout

## Visão geral
O carrinho da Jilo opera em 3 camadas: (1) Zustand store local com persist, (2) Shopify Cart API remoto, (3) UI com CartDrawer (mini-cart) e página /carrinho (cart completo). O checkout é feito por redirect para o checkout nativo do Shopify.

## Arquivos envolvidos

### Store
| Arquivo | Descrição |
|---------|-----------|
| `src/stores/cartStore.ts` | Store Zustand com persist (localStorage key `shopify-cart`). Gerencia items, cartId, checkoutUrl, discountCodes, cartCost, cartDiscountAllocations. Actions: addItem, updateQuantity, removeItem, clearCart, syncCart, getCheckoutUrl, applyDiscountCode, removeDiscountCode, refreshCartDetails |

### Hooks
| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/useCartSync.ts` | Roda no mount do App (`AppContent`). Valida se o cart Shopify ainda existe. Também re-valida quando a tab volta ao foco (visibilitychange). |

### Páginas
| Arquivo | Rota | Descrição |
|---------|------|-----------|
| `src/pages/Carrinho.tsx` | `/carrinho` | Página de carrinho completa com: tabela de itens, barra de frete grátis, cupom, cálculo de frete, resumo do pedido, desconto PIX, botão checkout, sugestões de produtos |

### Componentes
| Arquivo | Descrição |
|---------|-----------|
| `src/components/CartDrawer.tsx` | Drawer lateral (Sheet) — mini-cart com itens, barra de frete grátis, PixCallout, botão que navega para `/carrinho` |
| `src/components/CepChecker.tsx` | **(Descontinuado no carrinho)** Input de CEP com validação via ViaCEP. Preservado no codebase para usos futuros em FAQ/página de cobertura |
| `src/components/DeliveryAddressSelector.tsx` | Seletor de endereço no carrinho. Substitui o `<CepChecker />`. 4 estados: guest (CTA login), logado sem endereço (CTA cadastrar), logado com endereços (lista de cards selecionáveis + botão de novo), erro/loading |
| `src/components/PixCallout.tsx` | Card ou inline que orienta uso do código PIX5 no checkout. Variantes: `inline` (texto) e `card` (box com valor calculado) |
| `src/components/PaymentMethodSelector.tsx` | Seletor ativo de método de pagamento (PIX, Crédito, PayPal). Ao selecionar PIX, aplica automaticamente o cupom PIX5 via `applyDiscountCode`. Usado apenas em `/carrinho`. |
| `src/components/BenefitsSummary.tsx` | Lista de benefícios (desconto de kit, frete grátis, PIX) |
| `src/components/ShippingMethodSelector.tsx` | UI de seleção de frete no resumo do `/carrinho`. Sincroniza variant fantasma no cart Shopify automaticamente. Vide `.claude/fluxo-uber-direct.md` |

### Lib
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/shopify.ts` | Mutations: createShopifyCart, addLineToShopifyCart, updateShopifyCartLine, removeLineFromShopifyCart, fetchShopifyCart, applyDiscountCodesToCart, removeDiscountCodesFromCart, fetchCartWithDiscounts, setCartAttributes. Helpers: formatCheckoutUrl (interno), appendReturnToCheckoutUrl (exportado, Sprint 4.2). |
| `src/config/site.ts` | Constantes globais: `SITE_URL` (URL canônica do site, com fallback `https://jilomarmitas.com`) e `SITE_HOSTNAME`. Fonte única para qualquer link absoluto no frontend (return URLs, etc). |
| `src/lib/cepValidator.ts` | Validação de CEP via ViaCEP. Whitelist de áreas atendidas em `DELIVERY_AREAS`. Funções: `validateCep()`, `formatCep()`, `isAreaDeliverable(uf, city)` (síncrono, sem chamada ViaCEP — usado pelo `<DeliveryAddressSelector />`) |

## Tabelas do banco
Nenhuma. O carrinho é Zustand + Shopify Cart API.

## Constantes de negócio

| Constante | Valor | Onde é usada |
|-----------|-------|-------------|
| `PIX5` (cupom Shopify) | 5% off | Shopify Admin (NÃO combinável). Aplicado quando `<7` marmitas. |
| `PIX3` (cupom Shopify) | 3% off | Shopify Admin (combinável com produto). Aplicado quando `≥7` marmitas, acumula com Kit X%. |
| Cupons de desconto | Validados via Shopify (BEMVINDO10, JILOVIP15, PIX5, PIX3, JILO10) | Carrinho.tsx → cartStore → Shopify Cart API |
| Frete | Sempre grátis (cortesia Jilo) | Carrinho.tsx, CartDrawer.tsx |
| `SHIPPING_FREE_THRESHOLD` | 7 marmitas | `src/config/shipping.ts` (Sprint 4.1) |
| Frete < 7 itens | Cotado real-time via Uber Direct | `<ShippingMethodSelector />` em `/carrinho` |
| Frete ≥ 7 itens | Grátis (entrega Jilo) | Mesmo componente, mensagem diferente |

## Regras de negócio

1. **Criação lazy do cart**: O carrinho no Shopify só é criado na primeira vez que o usuário adiciona um item (`createShopifyCart`). Antes disso, `cartId` é null.

2. **Persistência local**: Zustand persist salva `items`, `cartId` e `checkoutUrl` em localStorage (key: `shopify-cart`).

3. **Sync com Shopify**: Toda ação (add, update, remove) é sincronizada imediatamente com Shopify Cart API via GraphQL mutation.

4. **Cart not found handler**: Se Shopify retorna "cart not found" ou "does not exist", o store local é limpo (`clearCart()`).

5. **Deduplição de itens (marmitas)**: Se o item já existe no carrinho, a quantidade é somada (update, não add). **Exceção: variant fantasma de frete `__internal_shipping`** — esta é singleton (R50). `cartStore.addItem` detecta via `isShippingVariant(variantId)` e faz REPLACE atômico (remove + add com `quantity = 1` e preço atualizado), nunca somando quantity. Veja `.claude/fluxo-uber-direct.md` para detalhes.

6. **Remoção**: Quantidade → 0 chama removeItem. Último item removido → clearCart.

7. **Frete condicional via Uber Direct (Sprint 4.1)**: Frete varia conforme quantidade de marmitas. **< 7 marmitas**: cliente paga frete cotado em real-time via Uber Direct (`<ShippingMethodSelector />` no resumo do `/carrinho`). **≥ 7 marmitas**: frete grátis (entrega Jilo). Veja `.claude/fluxo-uber-direct.md` para detalhes técnicos completos.

8. **Cupons de desconto**: Validados via Shopify Cart API (`cartDiscountCodesUpdate`). Cupons configurados no Shopify Admin (BEMVINDO10, JILOVIP15, PIX5, JILO10). O desconto real é aplicado no checkout Shopify. O frontend mostra o cupom como "Aplicado ✓" sem exibir o valor do desconto.

9. **Desconto PIX condicional via seletor (Sprint 4.4)**: Na página `/carrinho`, o componente `PaymentMethodSelector` oferece 3 opções (PIX, Cartão de Crédito, PayPal). Ao selecionar PIX, o cupom aplicado depende da quantidade de marmitas no cart (excluindo variant fantasma de frete):
   - `<7 marmitas` → cupom `PIX5` (5%). É NÃO combinável no Shopify — não acumula com nada.
   - `≥7 marmitas` → cupom `PIX3` (3%). É combinável com "Descontos de produto" → acumula com Kit 7/14/21/28.
   - Quando o cliente cruza o threshold com PIX selecionado, um `useEffect` interno detecta a mudança e troca o cupom no Shopify Cart API automaticamente, sem perder a seleção PIX do usuário. Toast de atualização: "Desconto PIX atualizado: X% off".
   - Se houver cupom manual ativo (BEMVINDO10, JILOVIP15, etc), o seletor mostra `window.confirm` antes de substituir.
   - Quando o cliente seleciona outro método com PIX antes ativo, o cupom (PIX5 ou PIX3) é removido via `removeDiscountCode()`.
   - Em qualquer cenário de `applicable=false`, o componente loga `console.error` com payload do cart para diagnóstico.
   - No `CartDrawer`, o `PixCallout` continua passivo/educativo com 5% — **débito técnico**: em sprint futura, considerar tornar o callout sensível à quantidade.

10. **Validação de CEP via ViaCEP (Sprint 2)**: `CepChecker` no resumo do pedido consulta a API ViaCEP e verifica contra a whitelist `DELIVERY_AREAS` em `src/lib/cepValidator.ts`. Se a região NÃO é atendida, o botão de checkout é desabilitado com "Região não atendida". Se o CEP não foi verificado, o checkout funciona normalmente — a verificação é recomendada, não obrigatória.

11. **PixCallout orienta uso do PIX5 em contextos passivos**: Componente `PixCallout` aparece em `Product.tsx`, `CartDrawer.tsx`, `Kit.tsx` e `KitLivre.tsx` com função educativa — mostra "PIX 5% off → R$ X" sem aplicar cupom. Na página `/carrinho` foi removido e substituído pelo `PaymentMethodSelector` (que aplica o cupom ativamente).

12. **Sugestões ("Complete sua semana")**: Carrega 20 produtos, filtra os que já estão no carrinho, embaralha e mostra 4 sugestões aleatórias.

13. **Checkout URL**: Vem do `cartCreate`. `formatCheckoutUrl` adiciona `?channel=online_store` no momento da criação. No momento de abrir o checkout (em `Carrinho.tsx` e `Product.tsx`), o helper `appendReturnToCheckoutUrl()` adiciona `?return_to=https://jilomarmitas.com` (Sprint 4.2 — R45). Em `/carrinho` abre em nova aba (`window.open(_, "_blank")`); em `/produto/:handle` abre na mesma aba (`window.location.href`).

14. **CartDrawer → /carrinho**: O botão "Ir para o Carrinho" no CartDrawer navega para `/carrinho` (não redireciona direto para Shopify).

15. **CartItem interface**: Cada item tem `lineId` (Shopify), `product` (ShopifyProduct), `variantId`, `variantTitle`, `price`, `quantity`, `selectedOptions`.

16. **cartCost e cartDiscountAllocations**: O cartStore armazena `cartCost` (totalAmount, subtotalAmount) e `cartDiscountAllocations` retornados pelo Shopify via `fetchCartFull`. O Carrinho exibe o desconto automático do Shopify (Automatic Discount por quantidade). `refreshCartDetails()` é chamado após cada mutação do cart e no mount da página `/carrinho`. **Sprint 5.1:** `cartDiscountAllocations` agora AGREGA as allocations de **linha** (`line.discountAllocations`) — o desconto de kit é do tipo `DiscountProducts` e aloca por linha, nunca em `cart.discountAllocations`. `refreshCartDetails()` percorre `cart.lines.edges`, soma `discountedAmount.amount` agrupando por `title` (fallback "Desconto de kit"), e mescla: allocations de cart-level primeiro, agregados de linha depois. Sem isso, o desconto de kit nunca aparecia no carrinho.

17. **Checkout requer login (Sprint 2)**: Na página `/carrinho`, o botão "Ir para o Checkout" verifica `useAuth().user`. Se `null`, abre o `AuthDialog` em modo signup ao invés de redirecionar pro Shopify. O label do botão muda para "Entrar para finalizar". Após login/signup bem-sucedido, o `useEffect` que escuta mudanças em `user` dispara o checkout automaticamente via `getCheckoutUrl() + window.open`. Se o usuário fecha o modal sem logar, o `pendingCheckout` state é resetado. O CartDrawer não precisa de gating porque o botão "Finalizar Compra" apenas navega para `/carrinho` — a verificação acontece lá.

18. **Return URL no checkout Shopify (Sprint 4.2)**: Em todo ponto de entrada do checkout Shopify (`handleCheckout` em `Carrinho.tsx` e `handleBuyNow` em `Product.tsx`), o frontend (a) grava cart attribute `return_url = SITE_URL` via `setCartAttributes`, e (b) enriquece o `checkoutUrl` com `?return_to=<SITE_URL>` via `appendReturnToCheckoutUrl`. O atributo dá rastreabilidade no Shopify Admin (vira `note_attribute` do pedido); o querystring controla o destino do botão "Continuar comprando". Fail-silent: erro em `setCartAttributes` é logado mas não bloqueia o redirect. Pré-requisito complementar fora de código: domínio primário `checkout.jilomarmitas.com` configurado no Shopify Admin.

19. **Seleção de endereço no checkout (Sprint 4.3)**: O `<DeliveryAddressSelector />` substitui o `<CepChecker />` no resumo do pedido em `/carrinho`. Em vez de pedir o CEP manualmente, ele lista os endereços cadastrados do usuário na tabela `addresses`. O `CepValidationResult` retornado ao `<ShippingMethodSelector />` é construído de forma síncrona via `isAreaDeliverable(uf, city)` — sem chamada ViaCEP. O `selected_address_id` é gravado como cart attribute junto com `delivery_method`, `uber_quote_id` e `return_url` no momento do checkout.

**R46.** Cotação de frete e checkout exigem endereço selecionado da tabela `addresses`. Guest vê CTA "Faça login para selecionar seu endereço" no resumo do `/carrinho`. Após login, lista de endereços renderiza automaticamente. Padrão pré-selecionado se existir.

**R47.** Endereço com CEP fora da whitelist `DELIVERY_AREAS` aparece na lista com badge "Não entregamos aqui" e radio desabilitado. Não esconder — ajuda usuário a entender por que o checkout não avança. Endereços não-entregáveis ficam por último na lista.

**R48.** Cart attribute `selected_address_id` é gravado junto com `delivery_method`, `uber_quote_id` e `return_url` no `handleCheckout` (rastreabilidade no Shopify Admin + Bling). Fail-silent (R26).

20. **`isAreaDeliverable` — novo fluxo de validação de área (Sprint 4.3)**: O fluxo antigo era: CEP do usuário → ViaCEP → whitelist. O novo fluxo é: endereço cadastrado no banco → `isAreaDeliverable(address.state, address.city)` → whitelist. A interface `CepValidationResult` permanece inalterada — apenas a fonte dos dados mudou.

**Hard-block do checkout (Sprint 4.7, R52; revisado Sprint 5.1):** o botão "Ir para o Checkout" só é habilitado quando o `shopifySubtotal` (`cartCost.subtotalAmount`) bate matematicamente com `expectedTotal` (tolerância R$ 0,01). Se há discrepância (ex: variant fantasma não entrou no Shopify Cart por falha de sincronização), o botão fica disabled exibindo "Sincronizando frete..." e `console.warn` alerta o time. **Sprint 5.1:** a base de comparação passou a ser o subtotal LÍQUIDO de kit — `expectedTotal = (subtotal - kitDiscountTotal) + activeShippingFeeCents/100` — porque `cartCost.subtotalAmount` do Shopify já vem COM o desconto automático de kit (alocado por linha). Antes, comparar contra o subtotal cheio travava o checkout de TODOS os kits (diff == valor do desconto) mesmo em frete grátis. Para 1-6 itens `kitDiscountTotal = 0`, então a base é idêntica ao subtotal cheio e a proteção de frete pago permanece inalterada.

**TOTAL da página é local (Sprint 4.8, R53; revisado Sprint 5.1):** o `displayTotal` exibido no resumo do `/carrinho` é `productsTotalWithDiscount + activeShippingFeeCents/100`, onde `productsTotalWithDiscount = subtotal - kitDiscountTotal` (subtotal cheio local menos o desconto de kit agregado). NÃO usa `cartCost.totalAmount` do Shopify (que não tem o frete e já tem o cupom manual aplicado). Por que não usar `cartCost.subtotalAmount` direto como "produtos": ele inclui a variant fantasma de frete quando ela está no cart → causaria dupla contagem do frete; a derivação local é robusta independente disso (`shopifySubtotal` fica só como diagnóstico/hard-block). O desconto de kit JÁ está embutido no total e visível na linha de desconto; só o cupom manual vai pro checkout Shopify. Isso desacopla DISPLAY (local) de COBRANÇA (Shopify Cart + variant fantasma).

## Fluxo do usuário

### Adicionar ao carrinho
1. Clique "ADICIONAR" em qualquer card de produto
2. Se `cartId` null → cria carrinho no Shopify → salva cartId, checkoutUrl, lineId
3. Se item existe → atualiza quantidade via `cartLinesUpdate`
4. Se item novo → adiciona via `cartLinesAdd`
5. Toast de confirmação

### CartDrawer (mini-cart)
1. Clique no ícone de carrinho no Header → abre Sheet lateral
2. Mostra barra de frete grátis (progresso até R$150)
3. Lista de itens com +/- quantidade e remover
4. Subtotal
5. Botão "Ir para o Carrinho" → navega para `/carrinho`

### Página /carrinho
1. Breadcrumb: Página Inicial > Meu Carrinho
2. Barra de frete grátis com progresso
3. Tabela de itens: imagem, nome, tipo, descrição, preço unitário, seletor de quantidade, remover, subtotal por item
4. Campo de cupom (BEMVINDO10 → R$10 off)
5. Coluna lateral (sticky): DeliveryAddressSelector (seleção de endereço cadastrado), BenefitsSummary, ShippingMethodSelector (cotação frete), breakdown de preços (subtotal, descontos Shopify, cupom, frete), total, PaymentMethodSelector (cartão, PayPal, PIX), botão "Ir para o Checkout" (desabilitado se área não atendida), trust badges
6. Seção "Complete sua semana" com 4 sugestões

### Seleção de endereço (`<DeliveryAddressSelector />`)

**Guest:**
1. Abre `/carrinho` sem login
2. Vê CTA "Faça login para selecionar seu endereço" no resumo
3. Clica → abre `<AuthDialog />` em modo signup
4. Após signup/login, componente re-renderiza com lista de endereços (vazia inicialmente)

**Logado sem endereço:**
1. Vê CTA "Cadastrar endereço"
2. Clica → abre `<AddressFormDialog />` inline (mesmo modal usado em `/conta/enderecos`)
3. Após cadastro, lista atualiza automaticamente via `queryClient.invalidateQueries`
4. Endereço default é pré-selecionado

**Logado com endereços:**
1. Vê lista de cards selecionáveis (radio)
2. Card default tem badge "Padrão" e vem pré-selecionado
3. Endereços não-entregáveis aparecem por último com badge "Não entregamos aqui" e radio disabled
4. Pode clicar em "Cadastrar novo endereço" pra abrir o `<AddressFormDialog />`
5. Mudar seleção dispara re-quote automaticamente via `useShippingQuote` (queryKey muda)
6. No checkout, `selected_address_id` é gravado como cart attribute

### Comprar agora (na página de produto)
1. addItem + pega checkoutUrl + `window.open` para Shopify

### Sync no mount
1. `useCartSync` roda no mount de `AppContent`
2. Se cartId existe → `fetchShopifyCart` → valida
3. Se cart inválido ou vazio → `clearCart()`
4. Também re-valida no `visibilitychange` (tab focus)

## Integrações
| Integração | Tipo | Operações | O que faz |
|-----------|------|-----------|-----------|
| Shopify Cart API | GraphQL Mutation | cartCreate, cartLinesAdd, cartLinesUpdate, cartLinesRemove | CRUD do carrinho |
| Shopify Cart API | GraphQL Query | cart(id) | Verifica se cart existe |
| Shopify Cart API | GraphQL Mutation | cartDiscountCodesUpdate | Aplica/remove discount codes no cart |
| Shopify Cart API | GraphQL Query | cartWithDiscounts | Busca cart com discountCodes e cost |

## Gotchas e armadilhas
- O `lineId` do Shopify é obrigatório para update/remove — se null, operação falha silenciosamente
- O localStorage key é `shopify-cart` — mudar interface do `CartItem` pode corromper carts salvos
- O checkout é 100% Shopify — cupom e desconto PIX do frontend NÃO são aplicados lá. Isso é uma lacuna conhecida (custom checkout com Getnet está planejado).
- **DISPLAY vs COBRANÇA são camadas separadas (R53; revisado Sprint 5.1):** o TOTAL que o cliente vê na página `/carrinho` é somatória local: `displayTotal = (subtotal - kitDiscountTotal) + activeShippingFeeCents/100`. Reflete o desconto de KIT (que já vem agregado em `cartDiscountAllocations`), mas NÃO o desconto do cupom MANUAL (que é aplicado só no checkout Shopify) nem depende da variant fantasma estar sincronizada. JÁ a COBRANÇA real (quando o cliente vai pro checkout nativo Shopify) depende da variant fantasma estar no Shopify Cart e do desconto configurado no Shopify Admin. Não confundir as duas: se mexer no `displayTotal` achando que ele controla a cobrança, vai quebrar. O `displayTotal` é puramente visual. A cobrança é garantida pela sincronização da variant fantasma (`<ShippingMethodSelector />`) + hard-block do `canCheckout` (R52).
- Se a store Shopify não tiver plano ativo → 402 → toast mas UX quebra
- `isSyncing` previne sync concorrente, mas `isLoading` não previne clicks rápidos — possível race condition
- O cupom BEMVINDO10 é hardcoded — qualquer outro cupom é silenciosamente ignorado
- O CepChecker usa ViaCEP (API gratuita sem SLA) — se a API falhar, exibe mensagem de erro sem bloquear o checkout
- A whitelist `DELIVERY_AREAS` em `cepValidator.ts` é expansível — para adicionar cidade, basta editar o array
- A seção de sugestões usa `Math.random()` para embaralhar — a cada render os resultados mudam
- O `handleCheckout` na página Carrinho abre o checkout em nova aba (`_blank`), enquanto o "Comprar Agora" na página de produto usa `window.location.href`
- Métodos de pagamento listados na UI (Alelo, Sodexo, VR, Ticket, Flash, VISA, MASTER, ELO, HIPER, PIX) são puramente visuais — dependem do gateway configurado no Shopify
- **O desconto de kit aloca por LINHA, não por cart (Sprint 5.1):** o Automatic Discount dos kits é do tipo `DiscountProducts`, que distribui o desconto em `line.discountAllocations` — `cart.discountAllocations` (nível cart) vem VAZIO para esse tipo. Por isso `refreshCartDetails()` agrega as allocations de linha (soma por `title`) antes de popular `cartDiscountAllocations`. Se mexer nessa leitura e voltar a ler só `cart.discountAllocations`, o desconto de kit some do carrinho (e o hard-block volta a travar — ver R52 revisado). Se os discounts não estiverem configurados no Shopify Admin, o carrinho funciona mas sem desconto.
- **Base do desconto PIX = subtotal com desconto de kit (Sprint 5.1):** o `Carrinho.tsx` passa `subtotalCents={Math.round((subtotal - kitDiscountTotal) * 100)}` ao `<PaymentMethodSelector />`. O PIX3 (≥7) no Shopify incide sobre o valor já com desconto de kit, então a "economia PIX" estimada precisa usar a mesma base — usar o subtotal cheio superestimava a economia nos kits. Para 1-6 itens `kitDiscountTotal = 0`, base = subtotal cheio (idêntico ao anterior). O `PaymentMethodSelector` não mudou — só a prop que recebe.
- `cartCost` pode ser null em carts salvos antes da Sprint 3 (localStorage stale) — o frontend faz fallback para cálculo local com `??`
- `FREE_SHIPPING_THRESHOLD` foi reintroduzido em `src/config/shipping.ts` como `SHIPPING_FREE_THRESHOLD = 7` para a feature Uber Direct (Sprint 4.1). Use o helper `isFreeShipping(totalNonShippingItems)` em vez de comparações ad-hoc.
- O parâmetro `?return_to=` do Shopify funciona em conjunto com o domínio primário configurado na loja. Como `checkout.jilomarmitas.com` é o domínio primário, o Shopify aceita `return_to` apontando pra `jilomarmitas.com` (mesmo apex domain).
- O cart attribute `return_url` aparece como `note_attribute` no Shopify Admin (no detalhe do pedido) — útil pra debug e potencial uso em automações futuras (n8n, Bling).
- ⚠️ **Additional Scripts (Shopify) descontinuado:** A Shopify removeu a funcionalidade de Additional Scripts na Order Status Page em 28/08/2025 (Plus) com auto-upgrade dos não-Plus iniciando em jan/2026. Customizações JS na thank-you page agora exigem Checkout UI Extensions (apps Shopify dedicadas). Não tentar usar Additional Scripts como reforço — não é mais editável.
- O `<DeliveryAddressSelector />` constrói um `CepValidationResult` síncrono a partir do endereço cadastrado — não bate na ViaCEP (todos os campos vêm do banco). O helper `isAreaDeliverable(uf, city)` em `cepValidator.ts` é o ponto único de checagem contra a whitelist `DELIVERY_AREAS`.
- O `<CepChecker />` antigo NÃO foi deletado — pode ser usado em outras páginas (FAQ, cobertura, landing). Mas não use mais em `/carrinho`.
- Usuários antigos com endereço em `profiles.address/cep/...` mas sem linha em `addresses` são tratados como "sem endereço". Migração desses dados é débito técnico pra sprint futura.
- Cart attribute `selected_address_id` é metadado adicional — NÃO substitui o `shipping_address` JSONB de `orders` (que continua vindo do payload do webhook `orders/paid`, regra R43).
- **`cartStore.addItem` tem dois caminhos:** (1) marmitas + primeira inserção de variant fantasma → fluxo normal (soma quantity se existir). (2) re-inserção de variant fantasma quando ela já existe → REPLACE atômico (remove no Shopify + add quantity=1 + atualiza array local via `.map` em vez de spread). Se mexer no `addItem`, lembre que o early return após o bloco de REPLACE é o que impede o fluxo normal de executar em sequência e voltar o bug.
- O cupom PIX é **condicional à quantidade** (R19): `PIX5` se cart <7 marmitas, `PIX3` se ≥7. Ambos vivem no Shopify Admin. PIX5 é não-combinável (não aceita com automatic discounts); PIX3 foi criado especificamente para combinar com os Kits. Não trocar a configuração de combinabilidade sem alinhar com regras de margem do Jilo.
- O `PixCallout` (em Product, CartDrawer, Kit, KitLivre) ainda exibe "5% off" estático e NÃO reflete a regra condicional. Cliente que pretende fechar ≥7 marmitas vê "5%" na vitrine mas paga 3% no carrinho. É inconsistência educativa conhecida — débito técnico documentado em `state.md`.
- O threshold de troca de cupom (`SHIPPING_FREE_THRESHOLD = 7`) é o MESMO usado pelo Uber Direct. Se o threshold mudar, isso afeta TRÊS lugares: frete, kits do Shopify Admin (que assumem 7) e a regra PIX.
- **Cadeia de identidade referencial `DeliveryAddressSelector` → `Carrinho.tsx` → `ShippingMethodSelector`:** O `<DeliveryAddressSelector />` produz um `CepValidationResult` via `buildResultFromAddress(selected)`. Esse resultado é passado pro `Carrinho.tsx` via `onResult(...)` callback, que faz `setDeliveryCheck(result)`. O `deliveryCheck` é então prop do `<ShippingMethodSelector />`. Cada link dessa cadeia DEVE preservar identidade referencial quando os valores não mudam — senão o `useEffect` de sincronização da variant fantasma no `<ShippingMethodSelector />` entra em loop de cancellation. Memoização em duas camadas (Sprint 4.6): (a) `DeliveryAddressSelector` memoiza `CepValidationResult` com chaves primitivas do endereço; (b) `ShippingMethodSelector` memoiza `cepParams` interno com chaves primitivas do `deliveryCheck.cepInfo`. Se um novo consumer de `deliveryCheck` aparecer no futuro, seguir o mesmo padrão.
- **Hard-block do `canCheckout` é defesa em profundidade (R52):** ele NÃO é o que sincroniza a variant fantasma — isso continua sendo trabalho do `<ShippingMethodSelector />`. O hard-block é o catch-net: se a sincronização falhar por qualquer motivo (token expirado, network error, race condition), o cliente é protegido de avançar pro checkout com cart bugado. Se aparecer "Sincronizando frete..." de forma persistente em ambiente normal (não simulado), investigar: provável que a edge `update-shipping-variant-price` esteja retornando erro — ver Console pro warning `[Carrinho] Discrepância detectada...` com o payload pra diagnóstico.
- **Variant fantasma de frete só entra no Cart se o produto estiver ACTIVE + publicado no Online Store (R54/R55, Sprint 5.0):** se o produto fantasma for despublicado do Online Store, ou tiver o status mudado pra DRAFT/UNLISTED, o `cartLinesAdd` falha (erro explícito "a mercadoria não existe" ou `node: null`) e a linha de frete não entra. O `cartStore.addItem` faz verificação pós-add APENAS pra variant fantasma (re-fetch + confirma a linha); se falhar, loga `[cartStore] CRITICAL` e o hard-block do `canCheckout` (R52) trava o checkout. Se aparecer `[cartStore] CRITICAL` ou "Sincronizando frete..." persistente em produção, primeiro suspeito: produto fantasma despublicado do Online Store ou status alterado — verificar no Shopify Admin (ver `fluxo-uber-direct.md`).
- **🐛→ Selecionar PIX trava o hard-block do checkout (descoberto Sprint 5.0; provavelmente resolvido como efeito colateral da Sprint 5.1 — VALIDAR):** ao escolher PIX, o `PaymentMethodSelector` aplica `PIX5`/`PIX3` no Shopify Cart, reduzindo o `subtotalAmount` (`18.94 × 0.95 + 10.50 ≈ 28.5`), mas o hard-block comparava contra o `expectedTotal` SEM desconto (29.44) → travava. Na Sprint 5.1, `expectedTotal` passou a subtrair `kitDiscountTotal`, que soma TODAS as `cartDiscountAllocations` — incluindo as de nível cart (`CartCodeDiscountAllocation`, onde o cupom PIX aloca). Logo o `expectedTotal` agora também desconta o PIX e deve bater com o `shopifySubtotal`. **Não validado manualmente ainda** — confirmar selecionando PIX em cart de 1-6 itens com frete pago e conferir que o botão libera. Se voltar a travar, a correção dedicada (comparar contra `totalAmount` quando há cupom) continua sendo o plano B, sem enfraquecer a proteção contra frete-ausente.
