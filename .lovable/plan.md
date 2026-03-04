

## Plan: Use Shopify search query instead of client-side filtering

### Current behavior
The search bar navigates to `/cardapio?search=term` and both `AllDishes.tsx` and `FullMenu.tsx` filter products **client-side** after fetching all 50 products. This means the search only works against already-loaded products and doesn't leverage Shopify's search capabilities.

### What changes

Pass the search term as a `query` variable to the Shopify Storefront API `products` query, so Shopify returns only matching products server-side.

### Files to change

**1. `src/components/sections/AllDishes.tsx`**
- Read `searchFilter` from URL params (already done)
- Pass it to `storefrontApiRequest(PRODUCTS_QUERY, { first: 50, query: searchFilter || undefined })` instead of fetching all and filtering client-side
- Re-fetch when `searchFilter` changes (add it to `useEffect` dependency)
- Remove the client-side `matchSearch` filter (keep tag filter client-side since that's a UI toggle)

**2. `src/components/sections/FullMenu.tsx`**
- Same approach: read search param, pass as `query` variable to the API call
- Re-fetch when search param changes

**3. `src/components/sections/Header.tsx`** — no changes needed, already navigates correctly

### Technical detail
The Storefront API `products(first: $first, query: $query)` field already accepts a `query` string parameter (already defined in `PRODUCTS_QUERY` in `shopify.ts`). Shopify will match against product title, description, tags, vendor, and type — giving better results than the current title-only client-side filter.

