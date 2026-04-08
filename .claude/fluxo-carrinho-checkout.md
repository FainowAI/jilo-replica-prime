# Fluxo: Carrinho e Checkout

## Visão geral
O carrinho da Jilo opera em 3 camadas: (1) Zustand store local com persist, (2) Shopify Cart API remoto, (3) UI com CartDrawer (mini-cart) e página /carrinho (cart completo). O checkout é feito por redirect para o checkout nativo do Shopify.

## Arquivos envolvidos

### Store
| Arquivo | Descrição |
|---------|-----------|
| `src/stores/cartStore.ts` | Store Zustand com persist (localStorage key `shopify-cart`). Gerencia items, cartId, checkoutUrl. Actions: addItem, updateQuantity, removeItem, clearCart, syncCart, getCheckoutUrl |

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
| `src/components/CartDrawer.tsx` | Drawer lateral (Sheet) — mini-cart com itens, barra de frete grátis, botão que navega para `/carrinho` |

### Lib
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/shopify.ts` | Mutations: createShopifyCart, addLineToShopifyCart, updateShopifyCartLine, removeLineFromShopifyCart, fetchShopifyCart |

## Tabelas do banco
Nenhuma. O carrinho é Zustand + Shopify Cart API.

## Constantes de negócio

| Constante | Valor | Onde é usada |
|-----------|-------|-------------|
| `FREE_SHIPPING_THRESHOLD` | R$ 150,00 | CartDrawer.tsx, Carrinho.tsx |
| `PIX_DISCOUNT` | 5% (0.05) | Carrinho.tsx |
| Cupom BEMVINDO10 | R$ 10,00 fixo | Carrinho.tsx (hardcoded) |
| Frete padrão | R$ 12,90 | Carrinho.tsx (mock, sem integração CEP real) |

## Regras de negócio

1. **Criação lazy do cart**: O carrinho no Shopify só é criado na primeira vez que o usuário adiciona um item (`createShopifyCart`). Antes disso, `cartId` é null.

2. **Persistência local**: Zustand persist salva `items`, `cartId` e `checkoutUrl` em localStorage (key: `shopify-cart`).

3. **Sync com Shopify**: Toda ação (add, update, remove) é sincronizada imediatamente com Shopify Cart API via GraphQL mutation.

4. **Cart not found handler**: Se Shopify retorna "cart not found" ou "does not exist", o store local é limpo (`clearCart()`).

5. **Deduplição de itens**: Se o item já existe no carrinho, a quantidade é somada (update, não add).

6. **Remoção**: Quantidade → 0 chama removeItem. Último item removido → clearCart.

7. **Frete grátis**: Compras ≥ R$150 ganham frete grátis. Barra de progresso visual em CartDrawer e Carrinho.

8. **Cupom BEMVINDO10**: Hardcoded no frontend — desconto fixo de R$10. Sem validação server-side. Case-insensitive (convertido para uppercase).

9. **Desconto PIX (5%)**: Calculado como `(subtotal - cupom + frete) * 0.05`. É puramente informativo — NÃO é aplicado no checkout Shopify.

10. **Frete**: Valor padrão R$12,90. Calculador de CEP é UI-only (valida se tem 8 dígitos, não consulta API). Se tem frete grátis, mostra R$0.

11. **Sugestões ("Complete sua semana")**: Carrega 20 produtos, filtra os que já estão no carrinho, embaralha e mostra 4 sugestões aleatórias.

12. **Checkout URL**: Vem do `cartCreate`. `formatCheckoutUrl` adiciona `?channel=online_store`. O checkout abre em nova aba (`window.open`).

13. **CartDrawer → /carrinho**: O botão "Ir para o Carrinho" no CartDrawer navega para `/carrinho` (não redireciona direto para Shopify).

14. **CartItem interface**: Cada item tem `lineId` (Shopify), `product` (ShopifyProduct), `variantId`, `variantTitle`, `price`, `quantity`, `selectedOptions`.

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
5. Coluna lateral (sticky): calcular frete por CEP, breakdown de preços (subtotal, cupom, frete, PIX), total, total PIX, métodos de pagamento (VA/VR, cartões, PIX), botão "Ir para o Checkout", trust badges
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

## Gotchas e armadilhas
- O `lineId` do Shopify é obrigatório para update/remove — se null, operação falha silenciosamente
- O localStorage key é `shopify-cart` — mudar interface do `CartItem` pode corromper carts salvos
- O checkout é 100% Shopify — cupom e desconto PIX do frontend NÃO são aplicados lá. Isso é uma lacuna conhecida (custom checkout com Getnet está planejado).
- Se a store Shopify não tiver plano ativo → 402 → toast mas UX quebra
- `isSyncing` previne sync concorrente, mas `isLoading` não previne clicks rápidos — possível race condition
- O cupom BEMVINDO10 é hardcoded — qualquer outro cupom é silenciosamente ignorado
- O cálculo de frete é fake — R$12,90 fixo, sem consulta a API de CEP
- A seção de sugestões usa `Math.random()` para embaralhar — a cada render os resultados mudam
- O `handleCheckout` na página Carrinho abre o checkout em nova aba (`_blank`), enquanto o "Comprar Agora" na página de produto usa `window.location.href`
- Métodos de pagamento listados na UI (Alelo, Sodexo, VR, Ticket, Flash, VISA, MASTER, ELO, HIPER, PIX) são puramente visuais — dependem do gateway configurado no Shopify
