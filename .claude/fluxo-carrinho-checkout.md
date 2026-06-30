# Fluxo: Carrinho e Checkout

## Visão geral
O carrinho da Jilo opera em 3 camadas: (1) Zustand store local com persist, (2) Shopify Cart API remoto, (3) UI com CartDrawer (mini-cart) e página /carrinho (cart completo). O checkout é feito por redirect para o checkout nativo do Shopify.

## Arquivos envolvidos

### Store
| Arquivo | Descrição |
|---------|-----------|
| `src/stores/cartStore.ts` | Store Zustand com persist (localStorage key `shopify-cart`). Gerencia items, cartId, checkoutUrl, discountCodes, cartCost, cartDiscountAllocations, `shopifyHasShippingLine` (R59 — verdade do servidor: a linha de frete está no Shopify Cart?; derivado em `refreshCartDetails`, NÃO persistido no `partialize`). Actions: addItem, updateQuantity, removeItem, clearCart, syncCart, getCheckoutUrl, applyDiscountCode, removeDiscountCode, refreshCartDetails, `reconcileDiscountsOnLoad` (R57 — remove PIX efêmero 1×/sessão via flag `pixReconciled`, preserva cupons manuais) |

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
| `src/components/KitQuantityNotice.tsx` | Aviso visual acionável da R56. Retorna `null` abaixo de `KIT_STEP`; em múltiplo válido mostra tom positivo e CTA para `/kit-livre`; em quantidade inválida mostra orientação para completar/remover até o múltiplo de `KIT_STEP`. Usado no `/carrinho` e no `CartDrawer` |
| `src/components/PaymentMethodSelector.tsx` | Seletor ativo de método de pagamento (PIX, Crédito, PayPal). Ao selecionar PIX, aplica automaticamente o cupom PIX5 via `applyDiscountCode`. Usado apenas em `/carrinho`. |
| `src/components/BenefitsSummary.tsx` | Lista de benefícios (desconto de kit, frete grátis, PIX) |
| `src/components/ShippingMethodSelector.tsx` | UI de seleção de frete no resumo do `/carrinho`. Sincroniza variant fantasma no cart Shopify automaticamente. Vide `.claude/fluxo-uber-direct.md` |

### Lib
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/shopify.ts` | Mutations: createShopifyCart, addLineToShopifyCart, updateShopifyCartLine, removeLineFromShopifyCart, fetchShopifyCart, applyDiscountCodesToCart, removeDiscountCodesFromCart, fetchCartWithDiscounts, setCartAttributes. Helpers: formatCheckoutUrl (interno), appendReturnToCheckoutUrl (exportado, Sprint 4.2). |
| `src/config/site.ts` | Constantes globais: `SITE_URL` (URL canônica do site, com fallback `https://jilomarmitas.com`) e `SITE_HOSTNAME`. Fonte única para qualquer link absoluto no frontend (return URLs, etc). |
| `src/config/kitQuantity.ts` | Helper puro da R56: `KIT_STEP = SHIPPING_FREE_THRESHOLD`, `isValidKitQuantity(totalNonShippingItems)` e `getKitQuantityGuidance(totalNonShippingItems)` |
| `src/config/pixCoupons.ts` | Fonte única do cupom PIX (R19, atualizado em R61): `PIX5` (ativo, sempre 5%), `PIX3` (descontinuado, reconhecido só p/ reconciliação), `isPixCoupon` e `getPixCouponForCart()` (sempre retorna PIX5/5%; o parâmetro `totalNonShippingItems` é ignorado) |
| `src/lib/cepValidator.ts` | Validação de CEP via ViaCEP. Whitelist de áreas atendidas em `DELIVERY_AREAS`. Funções: `validateCep()`, `formatCep()`, `isAreaDeliverable(uf, city)` (síncrono, sem chamada ViaCEP — usado pelo `<DeliveryAddressSelector />`) |

## Tabelas do banco
Nenhuma. O carrinho é Zustand + Shopify Cart API.

## Constantes de negócio

| Constante | Valor | Onde é usada |
|-----------|-------|-------------|
| `PIX5` (cupom Shopify) | 5% off | Shopify Admin — classe **ORDER** ("Amount off order", R61), 5% para QUALQUER quantidade. Combina com Kit X% (ORDER + PRODUCT). Único cupom PIX aplicado pelo frontend. |
| `PIX3` (cupom Shopify) | descontinuado | **DESATIVADO no Shopify Admin.** Não é mais aplicado pelo frontend; permanece em `PIX_COUPON_CODES` só para o `reconcileDiscountsOnLoad` limpar resíduo de sessões antigas. |
| `PIX_COUPON_CODES` | `PIX3`, `PIX5` | `src/config/pixCoupons.ts`; usado para identificar cupons PIX efêmeros (PIX3 mantido p/ reconciliação) |
| Cupons de desconto | Validados via Shopify (BEMVINDO10, JILOVIP15, PIX5, PIX3, JILO10) | Carrinho.tsx → cartStore → Shopify Cart API |
| Frete | Sempre grátis (cortesia Jilo) | Carrinho.tsx, CartDrawer.tsx |
| `SHIPPING_FREE_THRESHOLD` | 7 marmitas | `src/config/shipping.ts` (Sprint 4.1) |
| `KIT_STEP` | 7 marmitas | `src/config/kitQuantity.ts`; deriva de `SHIPPING_FREE_THRESHOLD` e é a fonte da regra R56 no frontend |
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

9. **Desconto PIX sempre 5% via seletor (Sprint 4.4, atualizado em R61)**: Na página `/carrinho`, o componente `PaymentMethodSelector` oferece 3 opções (PIX, Cartão de Crédito, PayPal). Ao selecionar PIX, aplica sempre o cupom `PIX5` (5%), independente da quantidade de marmitas:
   - `PIX5` é classe **ORDER** (R61) e combina com Kit 7/14/21/28 (ORDER + PRODUCT combinam na Shopify Basic). Não há mais regra condicional por volume — a antiga troca `PIX5 ↔ PIX3` ao cruzar o threshold de 7 marmitas foi removida.
   - `getPixCouponForCart()` retorna sempre `{ code: "PIX5", percent: 5 }`; o parâmetro `totalNonShippingItems` é ignorado (mantido só para não quebrar os call sites). Como o cupom não muda mais com a quantidade, o `useEffect` de re-aplicação por threshold foi removido do componente.
   - Se houver cupom manual ativo (BEMVINDO10, JILOVIP15, etc), o seletor mostra `window.confirm` antes de substituir.
   - Quando o cliente seleciona outro método com PIX antes ativo, o cupom é removido via `removeDiscountCode()`.
   - PIX é efêmero: `cartStore.reconcileDiscountsOnLoad()` remove PIX3/PIX5 persistido no localStorage/Shopify Cart uma vez por sessão, preservando cupons manuais. PIX3 segue reconhecido por `isPixCoupon` (apesar de descontinuado) justamente para que essa limpeza remova qualquer PIX3 grudento de sessões antigas.
   - Em qualquer cenário de `applicable=false`, o componente loga `console.error` com payload do cart para diagnóstico.
   - No `CartDrawer`, o `PixCallout` continua passivo/educativo com 5% — agora consistente com o cupom aplicado (PIX5 sempre 5%), sem o antigo descompasso de quantidade.

10. **Validação de CEP via ViaCEP (Sprint 2)**: `CepChecker` no resumo do pedido consulta a API ViaCEP e verifica contra a whitelist `DELIVERY_AREAS` em `src/lib/cepValidator.ts`. Se a região NÃO é atendida, o botão de checkout é desabilitado com "Região não atendida". Se o CEP não foi verificado, o checkout funciona normalmente — a verificação é recomendada, não obrigatória.

11. **PixCallout orienta uso do PIX5 em contextos passivos**: Componente `PixCallout` aparece em `Product.tsx`, `CartDrawer.tsx`, `Kit.tsx` e `KitLivre.tsx` com função educativa — mostra "PIX 5% off → R$ X" sem aplicar cupom. Na página `/carrinho` foi removido e substituído pelo `PaymentMethodSelector` (que aplica o cupom ativamente).

12. **Sugestões ("Complete sua semana")**: Carrega 20 produtos, filtra os que já estão no carrinho, embaralha e mostra 4 sugestões aleatórias.

13. **Checkout URL**: Vem do `cartCreate`. `formatCheckoutUrl` adiciona `?channel=online_store` no momento da criação. No momento de abrir o checkout (em `Carrinho.tsx` e `Product.tsx`), o helper `appendReturnToCheckoutUrl()` adiciona `?return_to=https://jilomarmitas.com` (Sprint 4.2 — R45). Em `/carrinho` abre em nova aba (`window.open(_, "_blank")`); em `/produto/:handle` abre na mesma aba (`window.location.href`).

14. **CartDrawer → /carrinho**: O botão "Ir para o Carrinho" no CartDrawer navega para `/carrinho` (não redireciona direto para Shopify).

15. **CartItem interface**: Cada item tem `lineId` (Shopify), `product` (ShopifyProduct), `variantId`, `variantTitle`, `price`, `quantity`, `selectedOptions`.

16. **cartCost e cartDiscountAllocations**: O cartStore armazena `cartCost` (totalAmount, subtotalAmount) e `cartDiscountAllocations` retornados pelo Shopify via `fetchCartFull`. O Carrinho exibe o desconto automático do Shopify (Automatic Discount por quantidade). `refreshCartDetails()` é chamado após cada mutação do cart e no mount da página `/carrinho`. **Sprint 5.1:** `cartDiscountAllocations` agora AGREGA as allocations de **linha** (`line.discountAllocations`) — o desconto de kit é do tipo `DiscountProducts` e aloca por linha, nunca em `cart.discountAllocations`. `refreshCartDetails()` percorre `cart.lines.edges`, soma `discountedAmount.amount` agrupando por `title` (fallback "Desconto de kit"), e mescla: allocations de cart-level primeiro, agregados de linha depois. Sem isso, o desconto de kit nunca aparecia no carrinho. **Sprint 5.2 (R62):** `cartDiscountAllocations` passou a conter **apenas desconto automático (Kit)** — ambas as fontes são filtradas por `code`: nível cart por `.filter(a => !a.code)`, nível linha por `if (alloc.code) continue`. Descontos por código (PIX3/PIX5 classe ORDER, cupons manuais) são descartados. Além disso, `cartCost` e `cartDiscountAllocations` foram **removidos do `partialize`** (não persistem mais no localStorage — verdade de servidor, recalculados a cada refresh). Pré-requisito: `CART_FULL_QUERY` agora expõe `... on CartCodeDiscountAllocation { code }` também no `discountAllocations` de linha.

17. **Checkout requer login (Sprint 2)**: Na página `/carrinho`, o botão "Ir para o Checkout" verifica `useAuth().user`. Se `null`, abre o `AuthDialog` em modo signup ao invés de redirecionar pro Shopify. O label do botão muda para "Entrar para finalizar". Após login/signup bem-sucedido, o `useEffect` que escuta mudanças em `user` dispara o checkout automaticamente via `getCheckoutUrl() + window.open`. Se o usuário fecha o modal sem logar, o `pendingCheckout` state é resetado. O CartDrawer não precisa de gating porque o botão "Finalizar Compra" apenas navega para `/carrinho` — a verificação acontece lá.

18. **Return URL no checkout Shopify (Sprint 4.2)**: Em todo ponto de entrada do checkout Shopify (`handleCheckout` em `Carrinho.tsx` e `handleBuyNow` em `Product.tsx`), o frontend (a) grava cart attribute `return_url = SITE_URL` via `setCartAttributes`, e (b) enriquece o `checkoutUrl` com `?return_to=<SITE_URL>` via `appendReturnToCheckoutUrl`. O atributo dá rastreabilidade no Shopify Admin (vira `note_attribute` do pedido); o querystring controla o destino do botão "Continuar comprando". Fail-silent: erro em `setCartAttributes` é logado mas não bloqueia o redirect. Pré-requisito complementar fora de código: domínio primário `checkout.jilomarmitas.com` configurado no Shopify Admin.

19. **Seleção de endereço no checkout (Sprint 4.3)**: O `<DeliveryAddressSelector />` substitui o `<CepChecker />` no resumo do pedido em `/carrinho`. Em vez de pedir o CEP manualmente, ele lista os endereços cadastrados do usuário na tabela `addresses`. O `CepValidationResult` retornado ao `<ShippingMethodSelector />` é construído de forma síncrona via `isAreaDeliverable(uf, city)` — sem chamada ViaCEP. O `selected_address_id` é gravado como cart attribute junto com `delivery_method`, `uber_quote_id` e `return_url` no momento do checkout.

**R46.** Cotação de frete e checkout exigem endereço selecionado da tabela `addresses`. Guest vê CTA "Faça login para selecionar seu endereço" no resumo do `/carrinho`. Após login, lista de endereços renderiza automaticamente. Padrão pré-selecionado se existir.

**R47.** Endereço com CEP fora da whitelist `DELIVERY_AREAS` aparece na lista com badge "Não entregamos aqui" e radio desabilitado. Não esconder — ajuda usuário a entender por que o checkout não avança. Endereços não-entregáveis ficam por último na lista.

**R48.** Cart attribute `selected_address_id` é gravado junto com `delivery_method`, `uber_quote_id` e `return_url` no `handleCheckout` (rastreabilidade no Shopify Admin + Bling). Fail-silent (R26).

**R48.1 (correção 2026-06-30).** Além do attribute, o endereço selecionado COMPLETO é enviado à Shopify via `cartBuyerIdentityUpdate` (`deliveryAddressPreferences`, helper `setCartDeliveryAddress` em `src/lib/shopify.ts`) — prefill do checkout → o pedido nasce com `shipping_address` nativo. Antes só o UUID ia (note_attribute) e o pedido ficava sem endereço de entrega. Fail-soft, nos mesmos dois pontos do R48.

20. **`isAreaDeliverable` — novo fluxo de validação de área (Sprint 4.3)**: O fluxo antigo era: CEP do usuário → ViaCEP → whitelist. O novo fluxo é: endereço cadastrado no banco → `isAreaDeliverable(address.state, address.city)` → whitelist. A interface `CepValidationResult` permanece inalterada — apenas a fonte dos dados mudou.

21. **Gate de quantidade (Sprint 5.1, R56)**: A partir de `KIT_STEP` marmitas, o checkout exige múltiplos exatos de `KIT_STEP`. A fonte única é `src/config/kitQuantity.ts`, que deriva `KIT_STEP` de `SHIPPING_FREE_THRESHOLD` e expõe `isValidKitQuantity`/`getKitQuantityGuidance`. Em `/carrinho`, `canCheckout` tem 4 condições independentes: endereço entregável, frete resolvido, quantidade válida e `freightStateOk` (estado da linha de frete no Shopify Cart — R59, substitui o antigo `totalMatchesShopify`). Quando a quantidade está inválida, o botão mostra "Complete seu kit de 7". `<KitQuantityNotice />` aparece a partir de `KIT_STEP`: positivo em múltiplos válidos, alerta em quantidades inválidas, sempre com CTA para `/kit-livre`.

**Hard-block por presença da linha de frete (Sprint 5.1, R59 — substitui o `totalMatchesShopify` da R52):** o botão "Ir para o Checkout" valida o ESTADO DO FRETE pela verdade do servidor — o flag `shopifyHasShippingLine`, derivado das linhas do Shopify Cart em `cartStore.refreshCartDetails` (`cart.lines.edges.some(e => isShippingVariant(e.node.merchandise.id))`). Regra em `Carrinho.tsx`: `freightStateOk = free ? !shopifyHasShippingLine : shopifyHasShippingLine` — frete grátis (≥ 7) ⇒ linha de frete AUSENTE; frete pago (1-6) ⇒ linha de frete PRESENTE. Estados transitórios: `freightSyncingWhilePaid` (`!free && activeQuoteId !== null && !shopifyHasShippingLine` → "Sincronizando frete...") e `freightSyncingWhileFree` (`free && shopifyHasShippingLine` → "Atualizando frete grátis…"). **Por que não comparar subtotais (⚠️ `totalMatchesShopify` OBSOLETO):** os descontos automáticos de Kit são `DiscountProducts` (Amount off products) e reduzem o `cartCost.subtotalAmount`. O antigo hard-block (R52, Sprint 4.9) comparava `subtotalAmount` contra `subtotal + activeShippingFeeCents` com tolerância R$ 0,01 — e nunca batia em pedidos ≥ 7 (subtotal descontado ≠ subtotal local cru), travando o checkout justamente nas quantidades de kit. O mesmo problema fazia o PIX travar o hard-block (bug aberto da Sprint 5.0): aplicar PIX reduzia o `subtotalAmount`. R59 elimina a aritmética de subtotal, então ambos os casos somem. A proteção contra avançar com frete não cobrado (intenção original da R52) segue válida — agora garantida pela presença/ausência da linha, imune a descontos. `console.warn` ainda alerta o time em `freightSyncingWhilePaid` (quote ativa mas linha ausente).

**TOTAL da página é local, COM desconto de kit (Sprint 4.8, R53; revisado Sprint 5.1, R60):** o `displayTotal` exibido no resumo do `/carrinho` é `productsTotalWithDiscount + activeShippingFeeCents/100`, onde `productsTotalWithDiscount = subtotal - kitDiscountTotal` (subtotal cheio local menos o desconto de kit agregado em `cartDiscountAllocations`). NÃO usa `cartCost.totalAmount` do Shopify (que não tem o frete e já tem o cupom manual aplicado). Por que não usar `cartCost.subtotalAmount` direto como "produtos": ele inclui a variant fantasma de frete quando ela está no cart → dupla contagem do frete; a derivação local é robusta independente disso. O desconto de KIT JÁ está embutido no total e visível na linha de desconto (R60); só o CUPOM manual vai pro checkout Shopify. Isso desacopla DISPLAY (local) de COBRANÇA (Shopify Cart + variant fantasma). A COBRANÇA continua garantida pela presença da variant fantasma no Shopify Cart, validada pelo hard-block do `canCheckout` (R59 — independente da aritmética de display).

**Desconto de kit visível no carrinho (Sprint 5.1, R60):** `cartStore.refreshCartDetails()` agrega `line.discountAllocations` (o desconto de kit é `DiscountProducts`, aloca por linha, nunca em `cart.discountAllocations`), somando por `title`, e popula `cartDiscountAllocations`. Isso alimenta: (a) a linha verde de desconto no resumo; (b) o `kitDiscountTotal` usado no `displayTotal` e no `productsTotalWithDiscount`; (c) a base do PIX no `<PaymentMethodSelector />` (`subtotalCents={Math.round((subtotal - kitDiscountTotal) * 100)}`). O hard-block NÃO depende disso (usa R59).

**Hard-block de quantidade (R56):** o `canCheckout` também exige `isValidKitQuantity(totalNonShippingItems)`. A regra vem de `src/config/kitQuantity.ts`: abaixo de `KIT_STEP` o pedido segue avulso; a partir de `KIT_STEP`, só múltiplos exatos de `KIT_STEP` avançam para checkout. Quando inválido, o botão fica disabled com "Complete seu kit de 7". O `/carrinho` mostra `<KitQuantityNotice />` no resumo lateral a partir de `KIT_STEP`; o CTA leva para `/kit-livre`. O `CartDrawer` renderiza `<KitQuantityNotice variant="inline" onNavigate={...} />` como aviso informativo e fecha o Sheet antes de navegar.

22. **Frete grátis blindado na transição (Sprint 5.1, R58)**: ao cruzar para ≥ 7 marmitas, a variant fantasma é removida com remoção ROBUSTA no `<ShippingMethodSelector />` (Caso 1 do effect de sync): `await removeItem` + verificação no snapshot fresh (`useCartStore.getState().items`) + 1 retry, com `console.error` crítico se persistir. Enquanto o Shopify Cart ainda tiver a linha de frete num carrinho grátis, o `Carrinho.tsx` deriva `freightSyncingWhileFree` (`free && shopifyHasShippingLine`, ver R59 — não mais por subtração de subtotais); o botão de checkout mostra "Atualizando frete grátis…" (estado transitório, entra no `aria-busy`). O bloqueio efetivo continua sendo o hard-block do `canCheckout` (R59) — `freightSyncingWhileFree` é só feedback visual. `!isQuantityValid` (R56) NÃO entra no `aria-busy` por ser bloqueio de regra, não carregamento.

23. **PIX efêmero reconciliado no load (Sprint 5.1, R57)**: `cartStore.reconcileDiscountsOnLoad()` roda 1×/sessão (flag `pixReconciled`), removendo cupons PIX (`PIX3`/`PIX5`, de `src/config/pixCoupons.ts`) persistidos no Shopify Cart e reaplicando apenas os manuais (ex.: `100teste`), que sobrevivem. Disparado no mount do `Carrinho.tsx` (com `syncCart`/`refreshCartDetails`) e na abertura do `CartDrawer` (com `syncCart`). Garante que o cliente que reabre o site não fique com PIX grudento de sessão anterior sem reselecionar o método.

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
4. Resumo: Subtotal (bruto) → linha(s) de desconto de kit (`cartDiscountAllocations`) → frete → **"Total estimado" = subtotal − desconto de kit**. Espelha o cálculo do `/carrinho` (`subtotal − kitDiscountTotal`); o drawer NÃO inclui frete no total (mostrado à parte como "Grátis"/"Calculado no carrinho"). O valor do botão "Finalizar Compra" usa o mesmo total com desconto.
5. Botão "Finalizar Compra" → navega para `/carrinho`

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
6. No checkout, `selected_address_id` é gravado como cart attribute **e** o endereço completo é enviado via `cartBuyerIdentityUpdate` (prefill do `shipping_address` na Shopify) — R48.1

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
- Cart attribute `selected_address_id` é metadado adicional (rastreabilidade/Bling). Desde a correção R48.1 (2026-06-30), o endereço completo TAMBÉM vai à Shopify via `cartBuyerIdentityUpdate` (`deliveryAddressPreferences`), então o `shipping_address` JSONB de `orders` passa a vir preenchido do payload `orders/paid` (R43) — antes vinha vazio porque a Shopify nunca recebia o endereço.
- **`cartStore.addItem` tem dois caminhos:** (1) marmitas + primeira inserção de variant fantasma → fluxo normal (soma quantity se existir). (2) re-inserção de variant fantasma quando ela já existe → REPLACE atômico (remove no Shopify + add quantity=1 + atualiza array local via `.map` em vez de spread). Se mexer no `addItem`, lembre que o early return após o bloco de REPLACE é o que impede o fluxo normal de executar em sequência e voltar o bug.
- O cupom PIX é **sempre 5%** (R19, atualizado em R61): o frontend aplica `PIX5` para qualquer quantidade. **`PIX5` é classe `ORDER`** (R61) — empilha com os Kits (classe `PRODUCT`) porque são classes diferentes, com `combinesWith` ligado nos dois lados. ⚠️ Dois descontos de PRODUTO na mesma linha NÃO empilham na Shopify Basic (só com Plus via `productDiscountsWithTagsOnSameCartLine`); por isso o PIX precisa ser ORDER. Não rebaixar o PIX5 para PRODUCT — o `applicable: false` volta. `PIX3` foi DESATIVADO no Shopify Admin e não é mais aplicado; segue em `isPixCoupon` só para reconciliação de resíduo. Não trocar a configuração sem alinhar com regras de margem do Jilo.
- O `PixCallout` (em Product, CartDrawer, Kit, KitLivre) exibe "5% off" estático — agora **consistente** com o cupom aplicado no carrinho (PIX5 sempre 5%). A antiga inconsistência educativa (vitrine 5% vs. carrinho 3% em ≥7 marmitas) deixou de existir com o fim da regra condicional.
- O `SHIPPING_FREE_THRESHOLD = 7` ainda governa frete (Uber Direct) e kits do Shopify Admin, mas **não governa mais o PIX** (que é 5% fixo). Se o threshold mudar, afeta frete e kits — não a regra PIX.
- **Cadeia de identidade referencial `DeliveryAddressSelector` → `Carrinho.tsx` → `ShippingMethodSelector`:** O `<DeliveryAddressSelector />` produz um `CepValidationResult` via `buildResultFromAddress(selected)`. Esse resultado é passado pro `Carrinho.tsx` via `onResult(...)` callback, que faz `setDeliveryCheck(result)`. O `deliveryCheck` é então prop do `<ShippingMethodSelector />`. Cada link dessa cadeia DEVE preservar identidade referencial quando os valores não mudam — senão o `useEffect` de sincronização da variant fantasma no `<ShippingMethodSelector />` entra em loop de cancellation. Memoização em duas camadas (Sprint 4.6): (a) `DeliveryAddressSelector` memoiza `CepValidationResult` com chaves primitivas do endereço; (b) `ShippingMethodSelector` memoiza `cepParams` interno com chaves primitivas do `deliveryCheck.cepInfo`. Se um novo consumer de `deliveryCheck` aparecer no futuro, seguir o mesmo padrão.
- **Hard-block do `canCheckout` é defesa em profundidade (R52):** ele NÃO é o que sincroniza a variant fantasma — isso continua sendo trabalho do `<ShippingMethodSelector />`. O hard-block é o catch-net: se a sincronização falhar por qualquer motivo (token expirado, network error, race condition), o cliente é protegido de avançar pro checkout com cart bugado. Se aparecer "Sincronizando frete..." de forma persistente em ambiente normal (não simulado), investigar: provável que a edge `update-shipping-variant-price` esteja retornando erro — ver Console pro warning `[Carrinho] Discrepância detectada...` com o payload pra diagnóstico.
- **Gate de quantidade é soft-block (R56):** todos os pontos de adição (cards, página de produto, sugestões, steppers, KitLivre) somam livremente; só o checkout do `/carrinho` bloqueia. O `CartDrawer` apenas exibe `<KitQuantityNotice variant="inline" />` como aviso informativo e continua navegando para `/carrinho`. Não auto-editar carrinho legado em quantidade inválida.
- **PIX é efêmero, cupons manuais persistem (R57):** `reconcileDiscountsOnLoad()` remove `PIX3`/`PIX5` do Shopify Cart no load (mount do `/carrinho` + abertura do `CartDrawer`), 1×/sessão via flag `pixReconciled`. Cupons manuais (ex.: `100teste`) NÃO são removidos — sobrevivem entre sessões. Não confundir: o PIX só é (re)aplicado quando o cliente seleciona PIX no `PaymentMethodSelector` na sessão atual; deixá-lo grudento aplicaria desconto sem reseleção. Se adicionar um novo cupom efêmero no futuro, registrá-lo em `src/config/pixCoupons.ts` (`isPixCoupon`) para que a reconciliação o limpe.
- **Remoção da variant fantasma em frete grátis tem retry (R58):** no Caso 1 do effect de sync do `<ShippingMethodSelector />`, a remoção é `await` + verificação no snapshot fresh do store + 1 retry. Se a linha de frete ficar presa num carrinho que deveria ser grátis, o `Carrinho.tsx` deriva `freightSyncingWhileFree` e o botão mostra "Atualizando frete grátis…", mas quem realmente segura o checkout é o hard-block do `canCheckout` (R52) — nunca liberar com frete preso. Se "Atualizando frete grátis…" persistir em produção, investigar a remoção (Console terá o `console.error` crítico do `ShippingMethodSelector`).
- **Variant fantasma de frete só entra no Cart se o produto estiver ACTIVE + publicado no Online Store (R54/R55, Sprint 5.0):** se o produto fantasma for despublicado do Online Store, ou tiver o status mudado pra DRAFT/UNLISTED, o `cartLinesAdd` falha (erro explícito "a mercadoria não existe" ou `node: null`) e a linha de frete não entra. O `cartStore.addItem` faz verificação pós-add APENAS pra variant fantasma (re-fetch + confirma a linha); se falhar, loga `[cartStore] CRITICAL` e o hard-block do `canCheckout` (R52) trava o checkout. Se aparecer `[cartStore] CRITICAL` ou "Sincronizando frete..." persistente em produção, primeiro suspeito: produto fantasma despublicado do Online Store ou status alterado — verificar no Shopify Admin (ver `fluxo-uber-direct.md`).
- **🐛→ Selecionar PIX trava o hard-block do checkout (descoberto Sprint 5.0; resolvido na Sprint 5.1 pela R59 — o hard-block deixou de comparar subtotais e passou a checar a presença da linha de frete, imune a descontos):** ao escolher PIX, o `PaymentMethodSelector` aplica `PIX5`/`PIX3` no Shopify Cart, reduzindo o `subtotalAmount`, e o antigo hard-block (R52) comparava contra o `expectedTotal` SEM desconto → travava. Com a R59 a comparação de subtotais não existe mais, então o caso some. Confirmar no QA selecionando PIX em cart de 1-6 itens (frete pago) e em cart de 7+ (com kit) e conferir que o botão libera.
- **✅ RESOLVIDO (Sprint 5.2, R62) — dupla contagem do desconto PIX no carrinho:** com kit ativo (≥7), a alocação do `PIX3` (classe `ORDER`, R61) chegava em `cart.discountAllocations` COM `code` e era mesclada sem filtro em `cartDiscountAllocations`, poluindo o `kitDiscountTotal` do `Carrinho.tsx` → o PIX era contado DUAS vezes (no TOTAL da página via `kitDiscountTotal` e de novo no preview do `<PaymentMethodSelector />`); além disso o preview gerava frações de centavo (ex.: R$ 159,458 / economia R$ 4,932). **Corrigido por 3 mudanças:** (1) `CART_FULL_QUERY` em `shopify.ts` passou a expor `... on CartCodeDiscountAllocation { code }` no `discountAllocations` de LINHA (antes só no de cart); (2) `cartStore.refreshCartDetails` filtra `!alloc.code` nas allocations de nível cart e `if (alloc.code) continue` no loop de linha — só o Kit automático entra em `cartDiscountAllocations`; (3) `<PaymentMethodSelector />` calcula o desconto/total do PIX em centavos (`Math.round`) e formata com `maximumFractionDigits: 2`. Complemento D4: `cartCost`/`cartDiscountAllocations` removidos do `partialize` (não persistem; recalculados no load). Como a base (`subtotalCents`) chega líquida de Kit e sem PIX, `pixFinalValue + pixDiscount` fecha exatamente com a base (subtotal − Kit), sem diferença de centavo.
- **Subtotal do checkout Shopify ≠ subtotal bruto do carrinho (correto e esperado):** o "Subtotal" exibido no checkout nativo Shopify = `cartCost.subtotalAmount` = **líquido dos descontos de produto** (o Kit é `DiscountProducts`, reduz o `subtotalAmount`). Isso é correto e esperado. O carrinho da Jiló exibe o subtotal **BRUTO** localmente (soma `price × quantity`) por escolha de UX, com o desconto de Kit numa linha separada (R60). Logo, os dois números não são idênticos por construção. Alinhamento 100% carrinho × checkout só virá no **checkout custom Getnet** (roadmap), quando o frontend/backend Jiló controlar display e cobrança.

## Roteiro de QA do checkout

> Cenários de regressão para o desconto PIX × Kit (Sprint 5.2; PIX atualizado para 5% sempre em R61/R19). Escala de Kit oficial = 5/10/15/20 (confirmada via Shopify Admin API, Junho 2026 — ver `fluxo-kits.md`). Caso de referência: **7 pratos**, subtotal **R$ 188,30**, Kit 7 **−5%** (−R$ 9,42) ⇒ base R$ 178,88; PIX5 **−5%** ⇒ preview R$ 169,94 (economia R$ 8,94).

- **Sem PIX (7 itens):** linha "Kit 7 – 5% off" = −R$ 9,42; sem linha "PIX5"; TOTAL = R$ 178,88.
- **Com PIX (7 itens):** "Total com PIX: R$ 169,94 (5% off — economia de R$ 8,94)"; sem 3 casas decimais; TOTAL grande continua R$ 178,88 (não muda ao selecionar PIX); "Cupom PIX5 Aplicado ✓".
- **1–6 itens + PIX:** cupom = PIX5 (5%), base = subtotal cheio (Kit = 0); preview = subtotal × 0,95, 2 casas.
- **Cupom manual + 7 itens:** cupom manual só como "Aplicado ✓" (não entra no TOTAL); linha "Kit 7 – 5% off" segue; TOTAL = subtotal − Kit.
- **CartDrawer:** linha de desconto mostra o Kit (ex.: "Kit 7 – 5% off −R$ 9,42") — nunca "PIX5"/"PIX3". Se aparecer cupom PIX no drawer, o filtro da R62 não foi aplicado.
- **CartDrawer (total com desconto, fix Junho/2026):** o "Total estimado" e o valor no botão "Finalizar Compra" = **subtotal − desconto de kit** (ex.: 7 pratos R$ 139,86 − R$ 6,93 = **R$ 132,93**), espelhando o `/carrinho`. Se o drawer exibir o subtotal cheio MESMO com a linha de desconto presente, o total parou de aplicar `kitDiscountTotal` (era o bug original: a linha aparecia mas não era subtraída do total).
- **Reload (D4):** com 7 itens + PIX previamente selecionado, recarregar a página: `cartDiscountAllocations` é recalculado (não vem do localStorage); não deve "piscar" valor velho de PIX; `reconcileDiscountsOnLoad` remove o PIX grudento.
- **Consistência matemática:** em qualquer cenário com PIX, `pixFinalValue + pixDiscount` = base (subtotal − Kit), sem diferença de centavo.
- **Hard-block intacto (R59):** selecionar PIX em cart de 1–6 (frete pago) e em 7+ (com Kit) — o botão "Ir para o Checkout" libera normalmente quando endereço/quantidade/frete estão OK (o hard-block usa `shopifyHasShippingLine`, não subtotais).
- **Cenário Fiscal (invariante R63):** o **total do checkout Shopify == total prometido no carrinho** (preview PIX), tolerância ± centavos. O imposto deve aparecer como **INCLUSO**, nunca somado ao total (market "Brasil" = `INCLUDES_TAXES_IN_PRICE`). Caso de referência: 7 pratos, Kit 7 −5%, PIX5 −5% → total **R$ 169,94**. Se o checkout somar imposto por cima (total > preview), suspeitar de reversão para `ADD_TAXES_AT_CHECKOUT` no market (ver R63).
