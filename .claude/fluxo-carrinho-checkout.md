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
| `src/components/CepChecker.tsx` | Input de CEP com validação via ViaCEP. Callback `onResult` informa se região é atendida |
| `src/components/PixCallout.tsx` | Card ou inline que orienta uso do código PIX5 no checkout. Variantes: `inline` (texto) e `card` (box com valor calculado) |
| `src/components/PaymentMethodSelector.tsx` | Seletor ativo de método de pagamento (PIX, Crédito, PayPal). Ao selecionar PIX, aplica automaticamente o cupom PIX5 via `applyDiscountCode`. Usado apenas em `/carrinho`. |
| `src/components/BenefitsSummary.tsx` | Lista de benefícios (desconto de kit, frete grátis, PIX) |
| `src/components/ShippingMethodSelector.tsx` | UI de seleção de frete no resumo do `/carrinho`. Sincroniza variant fantasma no cart Shopify automaticamente. Vide `.claude/fluxo-uber-direct.md` |

### Lib
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/shopify.ts` | Mutations: createShopifyCart, addLineToShopifyCart, updateShopifyCartLine, removeLineFromShopifyCart, fetchShopifyCart, applyDiscountCodesToCart, removeDiscountCodesFromCart, fetchCartWithDiscounts, setCartAttributes. Helpers: formatCheckoutUrl (interno), appendReturnToCheckoutUrl (exportado, Sprint 4.2). |
| `src/config/site.ts` | Constantes globais: `SITE_URL` (URL canônica do site, com fallback `https://jilomarmitas.com`) e `SITE_HOSTNAME`. Fonte única para qualquer link absoluto no frontend (return URLs, etc). |
| `src/lib/cepValidator.ts` | Validação de CEP via ViaCEP. Whitelist de áreas atendidas em `DELIVERY_AREAS`. Funções: `validateCep()`, `formatCep()` |

## Tabelas do banco
Nenhuma. O carrinho é Zustand + Shopify Cart API.

## Constantes de negócio

| Constante | Valor | Onde é usada |
|-----------|-------|-------------|
| `PIX5` (cupom Shopify) | 5% off | Shopify Admin, orientação no Carrinho.tsx |
| Cupons de desconto | Validados via Shopify (BEMVINDO10, JILOVIP15, PIX5, JILO10) | Carrinho.tsx → cartStore → Shopify Cart API |
| Frete | Sempre grátis (cortesia Jilo) | Carrinho.tsx, CartDrawer.tsx |
| `SHIPPING_FREE_THRESHOLD` | 7 marmitas | `src/config/shipping.ts` (Sprint 4.1) |
| Frete < 7 itens | Cotado real-time via Uber Direct | `<ShippingMethodSelector />` em `/carrinho` |
| Frete ≥ 7 itens | Grátis (entrega Jilo) | Mesmo componente, mensagem diferente |

## Regras de negócio

1. **Criação lazy do cart**: O carrinho no Shopify só é criado na primeira vez que o usuário adiciona um item (`createShopifyCart`). Antes disso, `cartId` é null.

2. **Persistência local**: Zustand persist salva `items`, `cartId` e `checkoutUrl` em localStorage (key: `shopify-cart`).

3. **Sync com Shopify**: Toda ação (add, update, remove) é sincronizada imediatamente com Shopify Cart API via GraphQL mutation.

4. **Cart not found handler**: Se Shopify retorna "cart not found" ou "does not exist", o store local é limpo (`clearCart()`).

5. **Deduplição de itens**: Se o item já existe no carrinho, a quantidade é somada (update, não add).

6. **Remoção**: Quantidade → 0 chama removeItem. Último item removido → clearCart.

7. **Frete condicional via Uber Direct (Sprint 4.1)**: Frete varia conforme quantidade de marmitas. **< 7 marmitas**: cliente paga frete cotado em real-time via Uber Direct (`<ShippingMethodSelector />` no resumo do `/carrinho`). **≥ 7 marmitas**: frete grátis (entrega Jilo). Veja `.claude/fluxo-uber-direct.md` para detalhes técnicos completos.

8. **Cupons de desconto**: Validados via Shopify Cart API (`cartDiscountCodesUpdate`). Cupons configurados no Shopify Admin (BEMVINDO10, JILOVIP15, PIX5, JILO10). O desconto real é aplicado no checkout Shopify. O frontend mostra o cupom como "Aplicado ✓" sem exibir o valor do desconto.

9. **Desconto PIX (5%) ativo via seletor**: Na página `/carrinho`, o componente `PaymentMethodSelector` oferece 3 opções (PIX, Cartão de Crédito, PayPal). Ao selecionar PIX, o cupom `PIX5` é aplicado automaticamente via `applyDiscountCode()` no Shopify Cart API. Ao selecionar outro método, se o PIX estava ativo, o cupom é removido via `removeDiscountCode()`. Se houver um cupom manual ativo (ex: `BEMVINDO10`), o seletor mostra `window.confirm` antes de substituir. No `CartDrawer`, o `PixCallout` continua sendo exibido em modo passivo (educativo) — o seletor ativo só existe no `/carrinho`.

10. **Validação de CEP via ViaCEP (Sprint 2)**: `CepChecker` no resumo do pedido consulta a API ViaCEP e verifica contra a whitelist `DELIVERY_AREAS` em `src/lib/cepValidator.ts`. Se a região NÃO é atendida, o botão de checkout é desabilitado com "Região não atendida". Se o CEP não foi verificado, o checkout funciona normalmente — a verificação é recomendada, não obrigatória.

11. **PixCallout orienta uso do PIX5 em contextos passivos**: Componente `PixCallout` aparece em `Product.tsx`, `CartDrawer.tsx`, `Kit.tsx` e `KitLivre.tsx` com função educativa — mostra "PIX 5% off → R$ X" sem aplicar cupom. Na página `/carrinho` foi removido e substituído pelo `PaymentMethodSelector` (que aplica o cupom ativamente).

12. **Sugestões ("Complete sua semana")**: Carrega 20 produtos, filtra os que já estão no carrinho, embaralha e mostra 4 sugestões aleatórias.

13. **Checkout URL**: Vem do `cartCreate`. `formatCheckoutUrl` adiciona `?channel=online_store` no momento da criação. No momento de abrir o checkout (em `Carrinho.tsx` e `Product.tsx`), o helper `appendReturnToCheckoutUrl()` adiciona `?return_to=https://jilomarmitas.com` (Sprint 4.2 — R45). Em `/carrinho` abre em nova aba (`window.open(_, "_blank")`); em `/produto/:handle` abre na mesma aba (`window.location.href`).

14. **CartDrawer → /carrinho**: O botão "Ir para o Carrinho" no CartDrawer navega para `/carrinho` (não redireciona direto para Shopify).

15. **CartItem interface**: Cada item tem `lineId` (Shopify), `product` (ShopifyProduct), `variantId`, `variantTitle`, `price`, `quantity`, `selectedOptions`.

16. **cartCost e cartDiscountAllocations**: O cartStore agora armazena `cartCost` (totalAmount, subtotalAmount) e `cartDiscountAllocations` retornados pelo Shopify via `fetchCartFull`. O Carrinho exibe o desconto automático do Shopify (Automatic Discount por quantidade). `refreshCartDetails()` é chamado após cada mutação do cart e no mount da página `/carrinho`.

17. **Checkout requer login (Sprint 2)**: Na página `/carrinho`, o botão "Ir para o Checkout" verifica `useAuth().user`. Se `null`, abre o `AuthDialog` em modo signup ao invés de redirecionar pro Shopify. O label do botão muda para "Entrar para finalizar". Após login/signup bem-sucedido, o `useEffect` que escuta mudanças em `user` dispara o checkout automaticamente via `getCheckoutUrl() + window.open`. Se o usuário fecha o modal sem logar, o `pendingCheckout` state é resetado. O CartDrawer não precisa de gating porque o botão "Finalizar Compra" apenas navega para `/carrinho` — a verificação acontece lá.

18. **Return URL no checkout Shopify (Sprint 4.2)**: Em todo ponto de entrada do checkout Shopify (`handleCheckout` em `Carrinho.tsx` e `handleBuyNow` em `Product.tsx`), o frontend (a) grava cart attribute `return_url = SITE_URL` via `setCartAttributes`, e (b) enriquece o `checkoutUrl` com `?return_to=<SITE_URL>` via `appendReturnToCheckoutUrl`. O atributo dá rastreabilidade no Shopify Admin (vira `note_attribute` do pedido); o querystring controla o destino do botão "Continuar comprando". Fail-silent: erro em `setCartAttributes` é logado mas não bloqueia o redirect. Pré-requisito complementar fora de código: domínio primário `checkout.jilomarmitas.com` configurado no Shopify Admin.

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
5. Coluna lateral (sticky): CepChecker (validação via ViaCEP), BenefitsSummary, breakdown de preços (subtotal, descontos Shopify, cupom, frete), PixCallout (PIX5), total, métodos de pagamento (cartão, PayPal, PIX), botão "Ir para o Checkout" (desabilitado se CEP não atendido), trust badges
6. Seção "Complete sua semana" com 4 sugestões

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
- Se a store Shopify não tiver plano ativo → 402 → toast mas UX quebra
- `isSyncing` previne sync concorrente, mas `isLoading` não previne clicks rápidos — possível race condition
- O cupom BEMVINDO10 é hardcoded — qualquer outro cupom é silenciosamente ignorado
- O CepChecker usa ViaCEP (API gratuita sem SLA) — se a API falhar, exibe mensagem de erro sem bloquear o checkout
- A whitelist `DELIVERY_AREAS` em `cepValidator.ts` é expansível — para adicionar cidade, basta editar o array
- A seção de sugestões usa `Math.random()` para embaralhar — a cada render os resultados mudam
- O `handleCheckout` na página Carrinho abre o checkout em nova aba (`_blank`), enquanto o "Comprar Agora" na página de produto usa `window.location.href`
- Métodos de pagamento listados na UI (Alelo, Sodexo, VR, Ticket, Flash, VISA, MASTER, ELO, HIPER, PIX) são puramente visuais — dependem do gateway configurado no Shopify
- O desconto de kit é um Automatic Discount no Shopify — ele aparece em `cart.discountAllocations`. Se os discounts não estiverem configurados no Shopify Admin, o carrinho funciona mas sem desconto.
- `cartCost` pode ser null em carts salvos antes da Sprint 3 (localStorage stale) — o frontend faz fallback para cálculo local com `??`
- `FREE_SHIPPING_THRESHOLD` foi reintroduzido em `src/config/shipping.ts` como `SHIPPING_FREE_THRESHOLD = 7` para a feature Uber Direct (Sprint 4.1). Use o helper `isFreeShipping(totalNonShippingItems)` em vez de comparações ad-hoc.
- O parâmetro `?return_to=` do Shopify funciona em conjunto com o domínio primário configurado na loja. Como `checkout.jilomarmitas.com` é o domínio primário, o Shopify aceita `return_to` apontando pra `jilomarmitas.com` (mesmo apex domain).
- O cart attribute `return_url` aparece como `note_attribute` no Shopify Admin (no detalhe do pedido) — útil pra debug e potencial uso em automações futuras (n8n, Bling).
- ⚠️ **Additional Scripts (Shopify) descontinuado:** A Shopify removeu a funcionalidade de Additional Scripts na Order Status Page em 28/08/2025 (Plus) com auto-upgrade dos não-Plus iniciando em jan/2026. Customizações JS na thank-you page agora exigem Checkout UI Extensions (apps Shopify dedicadas). Não tentar usar Additional Scripts como reforço — não é mais editável.
