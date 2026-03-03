

## Plan: Create 26 Individual Products in Shopify

Currently the store has only the 4 Kit products. We need to create 26 individual meal products using the `create_shopify_product` tool.

### Approach

Execute 26 sequential `create_shopify_product` calls, each with the exact data provided. Products are grouped into 4 batches:

**Batch 1 — Aves & Suínos (7 products)** at R$ 18.94
- Filé de Frango Pizzaiolo, Estrogonofe de Frango, Filé de Frango Desfiado, Filé de Frango Cubo Grelhado, Feijoada, Sobrecoxa de Frango, Pernil Suíno Desfiado

**Batch 2 — Peixes & Massas (7 products)** at R$ 20.30
- Tilápia Desfiada, Linguiça Toscana Assada, Panqueca de Frango e Calabresa, Lasanha Bolonhesa, Calabresa com Mandioca, Tilápia Grelhada, Lasanha Bechamel com Calabresa

**Batch 3 — Bovinos (7 products)** at R$ 25.70
- Patinho Moído, Carne Louca Desfiada, Escondidinho de Carne Seca, Picadinho com Batatas, Almôndegas ao Sugo, Hambúrguer Artesanal, Iscas de Carne

**Batch 4 — Veganos (5 products)** at R$ 25.70
- Lasanha de Brócolis, Nhoque ao Sugo com Proteína de Soja, Feijoada Vegana, Curry de Lentilha e Arroz de Couve Flor, Estrogonofe de Proteína de Soja

### Per-product configuration

Each product will be created with:
- `title`, `body_html`, `product_type`, `vendor: "Jilo"`, `status: "active"`, `tags` — as specified
- Single variant with correct price and `inventory_quantity: 50`

### No code changes needed

This is a Shopify Admin data operation only. No frontend files are modified — the existing `AllDishes` and `Collection` components already fetch products by `product_type` and will automatically display the new products.

