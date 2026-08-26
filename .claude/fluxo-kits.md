# Fluxo: Kits de Marmitas

## Visão geral
Kits com desconto progressivo por quantidade. 100% controlado pelo Shopify — preços vêm do Storefront API, descontos são Automatic Discounts do Shopify Admin. ZERO Supabase para kits.

**Decisão arquitetural**: Preços = Shopify. Descontos = Shopify Automatic Discounts. Collections = kits temáticos. O frontend mostra apenas estimativas de desconto antes de adicionar ao cart. Após adicionar, o Shopify calcula o desconto real.

## Arquivos envolvidos

### Páginas
| Arquivo | Rota | Descrição |
|---------|------|-----------|
| `src/pages/Kits.tsx` | `/kits` | **Hub de kits** — página dedicada e engajadora (funil de conversão). Hero verde: eyebrow dourado + headline serif + pills de benefício (Lucide, sem emoji) + CTAs "Montar meu Kit Livre" → `/kit-livre` e "Ver kits prontos" → âncora `#grade-kits`. Faixa de desconto progressivo (7/14/21/28 → 5/10/15/20%) com o tier de 28 destacado como "Melhor valor". Seção `<WeeklyKits />` reusada como grade. CTA de fechamento (band verde) reforçando `/kit-livre` + `/cardapio`. Acabamento premium seguindo a paleta da marca; hover/focus 150–300ms, `motion-reduce` respeitado, contraste AA. Composição pura — não recria cards nem fetch de preço. |
| `src/pages/Kit.tsx` | `/kit/:slug` | Kit temático — busca Collection do Shopify, seletor de tamanho (7/14/21/28), grid de pratos, sidebar com preço estimado, adiciona kit ao carrinho |
| `src/pages/KitLivre.tsx` | `/kit-livre` | Kit livre — montagem personalizada com pratos de qualquer categoria, seletor +/- por card, validação de múltiplo de 7 |

### Componentes
| Arquivo | Descrição |
|---------|-----------|
| `src/components/sections/WeeklyKits.tsx` | Seção "Kits para a Semana" na homepage — 5 cards (4 temáticos + Kit Livre), busca preço mínimo de cada Collection do Shopify |
| `src/components/FreeBadge.tsx` | Badge "Entrega grátis em até 48 horas a partir de 7 unidades." — reutilizável (sm/md) |
| `src/components/BenefitsSummary.tsx` | Lista de benefícios (desconto de kit, frete grátis, PIX) — usado no Carrinho, Kit e KitLivre |

### Rotas (em App.tsx)
| Rota | Componente |
|------|-----------|
| `/kits` | Kits (hub — registrada antes de `/kit/:slug`) |
| `/kit/:slug` | Kit |
| `/kit-livre` | KitLivre |

### Navegação para kits (repointada — Jul/2026)
Antes, "Montar meu Kit" e vários CTAs levavam à âncora `/#kits` (seção da home). Agora **todos apontam para a página dedicada `/kits`**: item "Kits" no `navLinks` do `Header.tsx` (desktop + mobile Sheet), os CTAs "Montar meu Kit" do Header, o `Hero.tsx`, o `Philosophy.tsx` e os breadcrumbs de `Kit.tsx`/`KitLivre.tsx`. A seção `<WeeklyKits id="kits">` continua existindo na home (o `/#kits` ainda rolaria até ela lá), mas o funil oficial é `/kits`.

## Collections no Shopify
| Handle | Nome | productType mapeado |
|--------|------|---------------------|
| `kit-leveza` | Kit Leveza | Aves e Suinos |
| `kit-sabor` | Kit Sabor | Peixes e Massas |
| `kit-forca` | Kit Força | Bovinos |
| `kit-verde` | Kit Verde | Veganos |

## Automatic Discounts (Shopify Admin)
Escala oficial (planilha) — confirmada via Shopify Admin API em Junho 2026. É a fonte de verdade; o frontend (`KIT_SIZES`/`KIT_TIERS`) deve sempre espelhar estes valores.
| Quantidade | Desconto | Título no Shopify (label do carrinho) |
|-----------|---------|-------|
| 7 | 5% | Kit 7 – 5% off |
| 14 | 10% | Kit 14 – 10% off |
| 21 | 15% | Kit 21 – 15% off |
| 28 | 20% | Kit 28 – 20% off |

## Regras de negócio

1. **Kit temático**: Busca pratos de uma Collection do Shopify. Seletor de tamanho (7/14/21/28). Distribui a quantidade igualmente entre os pratos do grupo (remainder vai para os primeiros). Cada prato é adicionado individualmente via `addItem`.

2. **Kit livre**: Busca todos os 50 produtos do catálogo. Usuário seleciona +/- por card. Validação: mínimo 7, sem teto superior, sempre múltiplo de 7. O desconto estimado usa `getDiscountForQty` e satura em 20% para qualquer quantidade >= 28.

3. **Preço estimado (frontend)**: Antes de adicionar ao carrinho, o frontend calcula: preço base × (1 - desconto%). Isso é exibido como "~R$ X" com nota "Desconto aplicado automaticamente no carrinho".

4. **Desconto real (Shopify)**: Após adicionar os itens ao carrinho, `refreshCartDetails()` lê o desconto do Shopify e popula `cartDiscountAllocations`. **Atenção:** o desconto de kit é um Automatic Discount do tipo `DiscountProducts`, que aloca **por linha** (`line.discountAllocations`), NÃO no nível do cart (`cart.discountAllocations`, que vem vazio para esse tipo). Por isso `refreshCartDetails()` AGREGA as allocations de linha (somando por `title`, ex: "Kit 7 – 5% off") e mescla com eventuais allocations de nível cart. O desconto real aparece no Carrinho e CartDrawer. (Sprint 5.1 — ver `fluxo-carrinho-checkout.md`.)

   **Regra de arredondamento (definida Junho/2026):** o desconto de kit exibido no Carrinho/CartDrawer é SEMPRE a alocação real do Shopify, NUNCA recalculado no frontend. O Shopify arredonda o percentual **por linha/unidade para baixo** (ex.: kit 7, R$ 19,98/un → 5% = R$ 0,999 → R$ 0,99 × 7 = **R$ 6,93**, não os R$ 6,99 dos 5% exatos sobre o subtotal). Isso garante **vitrine == checkout** (o cliente vê exatamente o que paga). A diferença (centavos, a favor da loja) é aceita. ⚠️ NÃO "corrigir" para 5% exato no frontend — isso reintroduz a divergência vitrine × checkout das Inconsistências 1/2. O preço estimado da página de kit (regra #3) é a única exibição que usa % exata, e por isso é rotulado "~R$ X" (aproximado).

5. **WeeklyKits**: Busca preço mínimo de cada Collection via `COLLECTION_BY_HANDLE_QUERY`. Exibe como "a partir de R$ X/un" usando o **maior desconto** (kit de 28 = 20% off → fator `× 0.80`), pois "a partir de" deve refletir o **menor preço por unidade** atingível. Kit Livre usa o menor preço entre todos os kits. (Ajustado em Junho/2026 — antes usava o tier de 10%/depois 5%, que não era o mínimo real.)

6. **KIT_META hardcoded**: Metadata dos kits (nome, emoji, bgColor, positioning) é hardcoded em `Kit.tsx` e `WeeklyKits.tsx`. A tabela `kit_templates` no Supabase existe mas NÃO é consumida pelo frontend (preparação futura).

## Fluxo do usuário

### Kit Temático (/kit/:slug)
1. Usuário clica no card de um kit na homepage (WeeklyKits)
2. Hero colorido com nome e positioning do kit
3. Seleciona tamanho: 7, 14, 21, ou 28 pratos
4. Visualiza grid de pratos da Collection
5. Sidebar mostra preço estimado com desconto
6. Clica "Adicionar Kit ao Carrinho"
7. Todos os pratos são adicionados individualmente
8. `refreshCartDetails()` busca desconto real do Shopify
9. Redirecionado para `/carrinho`

### Kit Livre (/kit-livre)
1. Usuário clica "Kit Livre" na homepage ou no link "Ver todos os kits"
2. Hero dourado com título "Monte seu Kit da Semana"
3. Filtra por categoria (Todos, Aves e Suinos, etc.)
4. Adiciona/remove pratos individualmente (+/- em cada card)
5. Sidebar (desktop) ou bottom bar (mobile) mostra progresso até múltiplo de 7
6. Helper: "Adicione mais N para completar o kit de Y"
7. Quando múltiplo de 7 (7, 14, 21, 28, 35, 42...): botão habilitado
8. Clica "Adicionar Kit ao Carrinho"
9. Todos os itens selecionados são adicionados individualmente
10. `refreshCartDetails()` busca desconto real
11. Seleção é limpa, redirecionado para `/carrinho`

## Integrações
| Integração | Tipo | O que faz |
|-----------|------|-----------|
| Shopify Storefront API | GraphQL Query (COLLECTION_BY_HANDLE_QUERY) | Busca Collection com produtos para kit temático |
| Shopify Storefront API | GraphQL Query (PRODUCTS_QUERY) | Busca todos os produtos para kit livre |
| Shopify Cart API | Mutations via cartStore | Adiciona itens individualmente ao carrinho |
| Shopify Cart API | Query (CART_FULL_QUERY) | Busca desconto real via `refreshCartDetails()` |

## Componentes adicionais (Sprint 2)

| Arquivo | Descrição |
|---------|-----------|
| `src/components/PixCallout.tsx` | Card "PIX com 5% off" com orientação do código PIX5. Presente nas sidebars de Kit.tsx e KitLivre.tsx |

## Responsividade mobile (Sprint 2)

- **Kit.tsx**: Sidebar desktop (`hidden lg:block`) + bottom sticky bar mobile (`lg:hidden fixed bottom-0 z-50`) com preço estimado e botão full-width. Spacer `h-[120px]`. Seletor de tamanho usa `grid-cols-4` com texto menor em mobile (`text-xl sm:text-2xl`). Hero com padding e fontes reduzidos em mobile.
- **KitLivre.tsx**: Sidebar desktop + mobile bottom bar com drag handle visual (`w-10 h-1 rounded-full`), summary expansível com `max-h-[45vh] overflow-y-auto`, botão com contador de selecionados e CTA. Spacer `h-[140px]`.

## QA checklist (referência para futuras sessões)

1. Homepage → seção "Kits para a Semana" mostra 5 cards com preços reais do Shopify
2. Clicar "Ver Kit" → navega para `/kit/:slug` com pratos da Collection
3. Trocar tamanho (7→14→21→28) → preço estimado atualiza corretamente
4. "Adicionar Kit ao Carrinho" → itens aparecem no CartDrawer → desconto Shopify visível
5. Kit Livre: selecionar pratos, verificar progresso, botão desabilitado até múltiplo de 7
6. Kit Livre: completar 7, 14, 28, 35 e 42 pratos → botão habilita → adicionar → desconto no carrinho
7. Kit Livre: confirmar que 35/42 não travam os botões `Adicionar`/`+` e que o desconto estimado permanece em 20%
8. Mobile (375px): bottom sheet funcional em Kit e KitLivre, sem overflow horizontal

## Gotchas e armadilhas
- **O desconto de kit aloca por LINHA, não por cart (Sprint 5.1):** o Automatic Discount dos kits é do tipo `DiscountProducts` no Shopify, que distribui o desconto em `line.discountAllocations` de cada item — `cart.discountAllocations` (nível cart) vem VAZIO para esse tipo. Qualquer leitura de desconto de kit DEVE agregar o nível de linha (somar `node.discountAllocations[].discountedAmount.amount` agrupando por `title`, ex.: "Kit 7 – 5% off"). O `refreshCartDetails()` em `cartStore.ts` já faz essa agregação e mescla com allocations de cart-level. Se um dia o desconto sumir do carrinho mesmo configurado no Admin, primeiro suspeito: alguém voltou a ler só `cart.discountAllocations`.
- Se Automatic Discounts NÃO estiverem configurados no Shopify Admin → carrinho funciona mas sem desconto visível. O preço estimado no frontend não baterá com o checkout.
- Limite de 50 produtos por query (`PRODUCTS_QUERY` e `COLLECTION_BY_HANDLE_QUERY`) — se o catálogo crescer, precisa de paginação.
- `KIT_META` é hardcoded em `Kit.tsx` — adicionar um novo kit temático requer alterar o código.
- `KIT_CONFIGS` em `WeeklyKits.tsx` também é hardcoded — deve estar em sincronia com `KIT_META`.
- A tabela `kit_templates` no Supabase NÃO é consumida pelo frontend — é preparação para admin futuro.
- A tabela `kit_discount_tiers` no Supabase NÃO é consumida pelo frontend — os tiers estão hardcoded em `KIT_SIZES`/`KIT_TIERS`.
- O preço estimado usa média simples dos preços dos pratos × quantidade — pode divergir do real se pratos tiverem preços muito diferentes.
- Kit temático distribui quantidade igualmente entre todos os pratos da Collection — se a Collection tiver 3 pratos e o kit for de 7, a distribuição será 3+2+2.
- Kit livre valida mínimo 7 e múltiplos de 7 sem teto superior — 35, 42 e acima são válidos; o desconto estimado continua saturando em 20% para quantidades >= 28.
- A Collection no Shopify precisa existir com o handle correto (kit-leveza, kit-sabor, etc.) — se não existir, o preço aparece como "—" no WeeklyKits e a grid fica vazia no Kit.
