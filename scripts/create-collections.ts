const SHOPIFY_STORE = 'jnutg9-u2.myshopify.com';
const API_VERSION = '2025-07';
const BASE_URL = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}`;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

if (!TOKEN) {
  console.error('❌ Set SHOPIFY_ADMIN_TOKEN env variable');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': TOKEN,
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const collections = [
  { title: "Aves e Suínos", product_type: "Aves e Suinos" },
  { title: "Peixes e Massas", product_type: "Peixes e Massas" },
  { title: "Bovinos", product_type: "Bovinos" },
  { title: "Veganos", product_type: "Veganos" },
  { title: "Kits", product_type: "Kit" },
];

async function main() {
  let success = 0;
  let errors = 0;

  for (const col of collections) {
    try {
      const res = await fetch(`${BASE_URL}/smart_collections.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          smart_collection: {
            title: col.title,
            rules: [{ column: "type", relation: "equals", condition: col.product_type }],
          },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`${res.status} — ${err}`);
      }
      console.log(`✅ Coleção criada: ${col.title}`);
      success++;
    } catch (e: any) {
      console.log(`❌ Erro: ${col.title} — ${e.message}`);
      errors++;
    }
    await delay(500);
  }

  console.log(`\n📊 Resumo: ${success} coleções criadas, ${errors} erros`);
}

main();
