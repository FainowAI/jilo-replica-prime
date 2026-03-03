

## Plan: Replace mocked dishes in FullMenu with Shopify products

### What changes

Replace the hardcoded `allDishes` data in `FullMenu.tsx` with live Shopify Storefront API data, grouping products by their `productType` field (which matches the categories: "Aves & Suínos", "Bovinos", "Peixes & Massas", "Veganos").

### Technical approach

**Single file change: `src/components/sections/FullMenu.tsx`**

1. **Remove** the `DishCard` interface and `allDishes` mock data
2. **Import** `storefrontApiRequest`, `PRODUCTS_QUERY`, `ShopifyProduct` from `@/lib/shopify`, `useCartStore` from cart store, and `Skeleton`/`Loader2` for loading states
3. **Fetch products** on mount using `storefrontApiRequest(PRODUCTS_QUERY, { first: 50 })`, store in state
4. **Group by `productType`** — same logic already used in `AllDishes.tsx`
5. **Filter by category** using the existing `currentCategory` search param logic, but now against live grouped data
6. **Render product cards** with:
   - Real images from `product.node.images.edges[0]`
   - Title, description from Shopify
   - Price from `priceRange.minVariantPrice.amount`
   - Badges from tags (reuse `TAG_BADGES` pattern from `AllDishes.tsx`)
   - Working "ADICIONAR" button wired to `addItem` from cart store
7. **Add loading skeleton** and error/retry states (same pattern as `AllDishes.tsx`)
8. **Update counts** — total and per-category counts derived from fetched data instead of hardcoded

### No other files need changes
The Shopify API client, cart store, and routing are already set up and working.

