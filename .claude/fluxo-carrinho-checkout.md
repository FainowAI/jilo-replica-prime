# Fluxo: Carrinho e Checkout

## Visão geral
O carrinho da Jilo é gerenciado pelo Zustand (estado local) sincronizado com o Shopify Cart API (estado remoto). O checkout é feito por redirect para o checkout nativo do Shopify.

## Arquivos envolvidos

### Store
| Arquivo | Descrição |
|---------|-----------|
| `src/stores/cartStore.ts` | Store Zustand com persist (localStorage). Gerencia items, cartId, checkoutUrl. Actions: addItem, updateQuantity, removeItem, clearCart, syncCart, getCheckoutUrl |

### Hooks
| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/useCartSync.ts` | Hook que roda no mount do App para verificar se o carrinho ainda existe no Shopify |

### Componentes
| Arquivo | Descrição |
|---------|-----------|
| `src/components/CartDrawer.tsx` | Drawer lateral do carrinho — mostra itens, quantidades, total, botão de checkout |

### Lib
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/shopify.ts` | Mutations: createShopifyCart, addLineToShopifyCart, updateShopifyCartLine, removeLineFromShopifyCart, fetchShopifyCart |

## Tabelas do banco
Nenhuma. O carrinho é Zustand + Shopify Cart API.

## Regras de negócio

1. **Criação lazy do cart**: O carrinho no Shopify só é criado na primeira vez que o usuário adiciona um item (`createShopifyCart`). Antes disso, `cartId` é null.

2. **Persistência local**: O Zustand persist salva `items`, `cartId` e `checkoutUrl` em localStorage (key: `shopify-cart`). Isso permite que o carrinho sobreviva a refreshes.

3. **Sync com Shopify**: Toda ação no carrinho (add, update, remove) é sincronizada imediatamente com o Shopify Cart API via GraphQL mutation.

4. **Cart not found handler**: Se o Shopify retorna erro "cart not found" ou "does not exist", o store local é limpo (`clearCart()`). Isso acontece quando o cart expira no Shopify.

5. **Deduplição de itens**: Se o usuário adiciona um item que já existe no carrinho, a quantidade é somada (não cria uma nova linha).

6. **Remoção**: Se quantidade chega a 0 via updateQuantity, chama removeItem. Se o último item é removido, clearCart limpa tudo.

7. **Checkout URL**: O `checkoutUrl` vem da resposta do `cartCreate`. A função `formatCheckoutUrl` adiciona `?channel=online_store` ao URL. O checkout é feito via `window.location.href` (redirect completo).

8. **Loading states**: `isLoading` para ações individuais (add/update/remove), `isSyncing` para o sync do cart no mount.

9. **CartItem interface**: Cada item tem `lineId` (do Shopify), `product`, `variantId`, `variantTitle`, `price`, `quantity`, `selectedOptions`.

## Fluxo do usuário

### Adicionar ao carrinho
1. Usuário clica "ADICIONAR" em um card de produto ou na página de detalhe
2. Se `cartId` é null: cria carrinho no Shopify (`cartCreate`) → salva `cartId`, `checkoutUrl`, `lineId`
3. Se item já existe: atualiza quantidade via `cartLinesUpdate`
4. Se item é novo: adiciona via `cartLinesAdd`
5. Toast "Produto adicionado ao carrinho!"

### Ver carrinho
1. Clique no ícone de carrinho no Header abre o CartDrawer
2. Drawer mostra lista de itens com imagem, nome, variante, preço unitário, seletor de quantidade
3. Total calculado somando price * quantity de cada item
4. Botão "Finalizar Compra" redireciona para `checkoutUrl` do Shopify

### Comprar agora (na página de produto)
1. Mesma lógica de addItem
2. Depois de adicionar, pega `checkoutUrl` via `getCheckoutUrl()`
3. Redireciona para checkout Shopify via `window.location.href`

### Sync no mount
1. `useCartSync` roda no `AppContent` (dentro do App.tsx)
2. Se `cartId` existe, chama `fetchShopifyCart` para verificar se o cart ainda é válido
3. Se cart não existe ou `totalQuantity === 0`, chama `clearCart()`

## Integrações
| Integração | Tipo | Mutations | O que faz |
|-----------|------|-----------|-----------|
| Shopify Cart API | GraphQL Mutation | cartCreate, cartLinesAdd, cartLinesUpdate, cartLinesRemove | CRUD completo do carrinho |
| Shopify Cart API | GraphQL Query | cart(id) | Verifica se cart existe |

## Gotchas e armadilhas
- O `lineId` vem do Shopify e é necessário para update/remove — se for null, a operação falha silenciosamente
- O localStorage key é `shopify-cart` — se mudar a interface do `CartItem`, carts salvos podem corromper. O `partialize` limita o que é salvo.
- O checkout é 100% Shopify — não há fluxo de checkout customizado no frontend
- O desconto Pix (5%) aparece na página de produto mas NÃO é aplicado no checkout Shopify — é apenas indicativo
- Se a store Shopify não tiver plano ativo, o carrinho retorna 402 — há toast mas o UX quebra
- `isSyncing` previne chamadas concorrentes no syncCart, mas `isLoading` não previne — clicks rápidos podem gerar race conditions
- O `handleBuyNow` na página de produto faz addItem + redirect — se o addItem falhar, o redirect não acontece (bom), mas o toast de erro pode se perder no redirect
