const SHOPIFY_STORE = "jnutg9-u2.myshopify.com";
const API_VERSION = "2025-07";
const BASE_URL = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}`;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

if (!TOKEN) {
  console.error("SHOPIFY_ADMIN_TOKEN não está definido. Adicione no .env e rode com 'npx tsx scripts/setup-shipping-variant.ts'");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "X-Shopify-Access-Token": TOKEN,
};

async function findExisting(): Promise<{ id: string; variantId: string; gid: string } | null> {
  const res = await fetch(`${BASE_URL}/products.json?handle=frete-uber-direct`, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  const product = data.products?.[0];
  if (!product) return null;
  return {
    id: String(product.id),
    variantId: String(product.variants[0].id),
    gid: `gid://shopify/ProductVariant/${product.variants[0].id}`,
  };
}

async function create(): Promise<{ id: string; variantId: string; gid: string }> {
  const payload = {
    product: {
      title: "Frete Uber Direct",
      handle: "frete-uber-direct",
      product_type: "Shipping",
      vendor: "Jilo",
      status: "draft",
      tags: "__internal_shipping",
      published: false,
      variants: [
        {
          price: "0.01",
          inventory_management: null,
          inventory_policy: "continue",
          requires_shipping: false,
          taxable: false,
        },
      ],
    },
  };

  const res = await fetch(`${BASE_URL}/products.json`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Falha ao criar produto: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const product = data.product;
  return {
    id: String(product.id),
    variantId: String(product.variants[0].id),
    gid: `gid://shopify/ProductVariant/${product.variants[0].id}`,
  };
}

async function main() {
  console.log("🔍 Verificando se produto já existe...");
  const existing = await findExisting();

  if (existing) {
    console.log("✅ Produto já existe.");
    console.log(`   Product ID: ${existing.id}`);
    console.log(`   Variant ID: ${existing.variantId}`);
    console.log(`   Variant GID: ${existing.gid}`);
    console.log("\n📋 Adicione no .env do Lovable e nos Supabase Edge Function Secrets:");
    console.log(`   VITE_SHOPIFY_SHIPPING_VARIANT_ID=${existing.gid}`);
    console.log(`   SHOPIFY_SHIPPING_VARIANT_ID=${existing.gid}`);
    return;
  }

  console.log("🆕 Criando produto fantasma...");
  const result = await create();

  console.log("✅ Produto criado!");
  console.log(`   Product ID: ${result.id}`);
  console.log(`   Variant ID: ${result.variantId}`);
  console.log(`   Variant GID: ${result.gid}`);
  console.log("\n📋 Adicione no .env do Lovable e nos Supabase Edge Function Secrets:");
  console.log(`   VITE_SHOPIFY_SHIPPING_VARIANT_ID=${result.gid}`);
  console.log(`   SHOPIFY_SHIPPING_VARIANT_ID=${result.gid}`);
}

main().catch((err) => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
