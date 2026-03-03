

## Plan: Refactor WeeklyKits + Create Kit Products in Shopify

### Part 1 — Create 4 Kit Products in Shopify

Using the `create_shopify_product` tool, create each kit with `product_type: "Kit"`, `vendor: "Jilo"`, option "Quantidade" with 4 values, and 4 variants with correct prices:

1. **Kit Jilo — Aves & Suínos** | tags: `kit,aves-suinos,mais-pedido`
   - Variants: 7un R$119.32, 14un R$225.39, 21un R$318.19, 28un R$397.74

2. **Kit Jilo — Peixes & Massas** | tags: `kit,peixes-massas`
   - Variants: 7un R$127.89, 14un R$241.57, 21un R$341.04, 28un R$426.30

3. **Kit Jilo — Bovinos** | tags: `kit,bovinos`
   - Variants: 7un R$161.91, 14un R$305.83, 21un R$431.76, 28un R$539.70

4. **Kit Jilo — Veganos** | tags: `kit,veganos,vegano`
   - Variants: 7un R$161.91, 14un R$305.83, 21un R$431.76, 28un R$539.70

### Part 2 — Refactor `src/components/sections/WeeklyKits.tsx`

Replace the static array with structured kit data including:

- **Data**: Hardcoded array with name, tagline, badge, and price table per quantity (7/14/21/28)
- **State**: `useState` per card tracking selected quantity (default: 7)
- **Quantity selector**: 4 radio-style buttons ("7", "14", "21", "28") — selecting updates displayed price
- **Price display**: "a partir de R$ XX,XX" updates to show selected variant price formatted with `toLocaleString('pt-BR')`
- **Badge**: "até 25% OFF" on all cards, plus "⭐ Mais pedido" on G1
- **CTA**: "Montar Kit" button (placeholder for now, will connect to cart when Shopify kits exist)
- **Footer note**: "+ 5% OFF no Pix" text below CTA
- **Layout**: Keep existing grid (1col mobile, 2col sm, 4col lg), dark bg, accent colors

### Technical Details

- No new dependencies needed
- Kit prices hardcoded as specified (not fetched from Shopify yet)
- Quantity selector uses simple button group with active state styling
- Preserves existing section structure (id="kits", container, header)

