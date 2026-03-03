

## Plan: Create Shopify Seed Scripts

You have read-only access to this Shopify store through Lovable, but I can create the scripts for you to run locally with your own Admin API token.

### Files to Create

**1. `scripts/seed-products.ts`**
- Define all 26 individual products and 4 kit products with variants as specified
- POST each to Shopify Admin REST API (`/admin/api/2025-07/products.json`)
- 500ms delay between requests for rate limiting
- Console logging with checkmark/cross per product
- Final summary count

**2. `scripts/create-collections.ts`**
- Create 5 smart collections via POST to `/admin/api/2025-07/smart_collections.json`
- 4 collections filtering by product_type: "Aves e Suinos", "Peixes e Massas", "Bovinos", "Veganos"
- 1 collection "Kits" filtering by product_type: "Kit"

**3. Update `package.json`**
- Add `"seed"` and `"seed:collections"` scripts using `ts-node`

### How to Run

You'll need to install `ts-node` as a dev dependency and set the `SHOPIFY_ADMIN_TOKEN` environment variable before running:

```
SHOPIFY_ADMIN_TOKEN=your_token npx ts-node scripts/seed-products.ts
```

### Technical Notes

- Scripts use plain `fetch` (available in Node 18+) — no extra dependencies needed beyond `ts-node`
- All product data is hardcoded in the script as specified in your message
- Kit products use Shopify's `options` + `variants` structure with "Quantidade" as the option name
- Each variant gets `inventory_management: "shopify"` and `inventory_quantity: 50`

