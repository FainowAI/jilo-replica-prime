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

interface ProductInput {
  title: string;
  product_type: string;
  vendor: string;
  status: string;
  tags: string[];
  options?: Array<{ name: string; values: string[] }>;
  variants: Array<{
    price: string;
    option1?: string;
    inventory_management: string;
    inventory_quantity: number;
  }>;
}

const individual: ProductInput[] = [
  // G1 — Aves e Suinos — R$18.94
  ...([
    ["Filé de Frango Pizzaiolo", ["aves-suinos"]],
    ["Estrogonofe de Frango", ["aves-suinos", "mais-pedido"]],
    ["Filé de Frango Desfiado", ["aves-suinos"]],
    ["Filé de Frango Cubo Grelhado", ["aves-suinos"]],
    ["Feijoada", ["aves-suinos"]],
    ["Sobrecoxa de Frango", ["aves-suinos"]],
    ["Pernil Suíno Desfiado", ["aves-suinos"]],
  ] as [string, string[]][]).map(([title, tags]) => ({
    title,
    product_type: "Aves e Suinos",
    vendor: "Jilo",
    status: "active",
    tags,
    variants: [{ price: "18.94", inventory_management: "shopify", inventory_quantity: 50 }],
  })),

  // G2 — Peixes e Massas — R$20.30
  ...([
    ["Tilápia Desfiada", ["peixes-massas", "low-carb"]],
    ["Linguiça Toscana Assada", ["peixes-massas"]],
    ["Panqueca de Frango e Calabresa", ["peixes-massas"]],
    ["Lasanha Bolonhesa", ["peixes-massas", "mais-pedido"]],
    ["Calabresa com Mandioca", ["peixes-massas"]],
    ["Tilápia Grelhada", ["peixes-massas", "low-carb"]],
    ["Lasanha Bechamel com Calabresa", ["peixes-massas"]],
  ] as [string, string[]][]).map(([title, tags]) => ({
    title,
    product_type: "Peixes e Massas",
    vendor: "Jilo",
    status: "active",
    tags,
    variants: [{ price: "20.30", inventory_management: "shopify", inventory_quantity: 50 }],
  })),

  // G3 — Bovinos — R$25.70
  ...([
    ["Patinho Moído", ["bovinos"]],
    ["Carne Louca Desfiada", ["bovinos"]],
    ["Escondidinho de Carne Seca", ["bovinos", "mais-pedido"]],
    ["Picadinho com Batatas", ["bovinos"]],
    ["Almôndegas ao Sugo", ["bovinos"]],
    ["Hambúrguer Artesanal", ["bovinos", "novo"]],
    ["Iscas de Carne", ["bovinos"]],
  ] as [string, string[]][]).map(([title, tags]) => ({
    title,
    product_type: "Bovinos",
    vendor: "Jilo",
    status: "active",
    tags,
    variants: [{ price: "25.70", inventory_management: "shopify", inventory_quantity: 50 }],
  })),

  // G4 — Veganos — R$25.70
  ...([
    ["Lasanha de Brócolis", ["veganos", "vegano"]],
    ["Nhoque ao Sugo com Proteína de Soja", ["veganos", "vegano"]],
    ["Feijoada Vegana", ["veganos", "vegano", "mais-pedido"]],
    ["Curry de Lentilha e Arroz de Couve Flor", ["veganos", "vegano"]],
    ["Estrogonofe de Proteína de Soja", ["veganos", "vegano"]],
  ] as [string, string[]][]).map(([title, tags]) => ({
    title,
    product_type: "Veganos",
    vendor: "Jilo",
    status: "active",
    tags,
    variants: [{ price: "25.70", inventory_management: "shopify", inventory_quantity: 50 }],
  })),
];

const variantBase = { inventory_management: "shopify" as const, inventory_quantity: 50 };

const kits: ProductInput[] = [
  {
    title: "Kit Jilo — Aves & Suínos",
    product_type: "Kit",
    vendor: "Jilo",
    status: "active",
    tags: ["kit", "aves-suinos", "mais-pedido"],
    options: [{ name: "Quantidade", values: ["7 marmitas", "14 marmitas", "21 marmitas", "28 marmitas"] }],
    variants: [
      { option1: "7 marmitas", price: "119.32", ...variantBase },
      { option1: "14 marmitas", price: "225.39", ...variantBase },
      { option1: "21 marmitas", price: "318.19", ...variantBase },
      { option1: "28 marmitas", price: "397.74", ...variantBase },
    ],
  },
  {
    title: "Kit Jilo — Peixes & Massas",
    product_type: "Kit",
    vendor: "Jilo",
    status: "active",
    tags: ["kit", "peixes-massas"],
    options: [{ name: "Quantidade", values: ["7 marmitas", "14 marmitas", "21 marmitas", "28 marmitas"] }],
    variants: [
      { option1: "7 marmitas", price: "127.89", ...variantBase },
      { option1: "14 marmitas", price: "241.57", ...variantBase },
      { option1: "21 marmitas", price: "341.04", ...variantBase },
      { option1: "28 marmitas", price: "426.30", ...variantBase },
    ],
  },
  {
    title: "Kit Jilo — Bovinos",
    product_type: "Kit",
    vendor: "Jilo",
    status: "active",
    tags: ["kit", "bovinos"],
    options: [{ name: "Quantidade", values: ["7 marmitas", "14 marmitas", "21 marmitas", "28 marmitas"] }],
    variants: [
      { option1: "7 marmitas", price: "161.91", ...variantBase },
      { option1: "14 marmitas", price: "305.83", ...variantBase },
      { option1: "21 marmitas", price: "431.76", ...variantBase },
      { option1: "28 marmitas", price: "539.70", ...variantBase },
    ],
  },
  {
    title: "Kit Jilo — Veganos",
    product_type: "Kit",
    vendor: "Jilo",
    status: "active",
    tags: ["kit", "veganos", "vegano"],
    options: [{ name: "Quantidade", values: ["7 marmitas", "14 marmitas", "21 marmitas", "28 marmitas"] }],
    variants: [
      { option1: "7 marmitas", price: "161.91", ...variantBase },
      { option1: "14 marmitas", price: "305.83", ...variantBase },
      { option1: "21 marmitas", price: "431.76", ...variantBase },
      { option1: "28 marmitas", price: "539.70", ...variantBase },
    ],
  },
];

async function createProduct(product: ProductInput) {
  const res = await fetch(`${BASE_URL}/products.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ product }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status} — ${err}`);
  }
  return res.json();
}

async function main() {
  const allProducts = [...individual, ...kits];
  let success = 0;
  let errors = 0;

  for (const product of allProducts) {
    try {
      await createProduct(product);
      console.log(`✅ Criado: ${product.title}`);
      success++;
    } catch (e: any) {
      console.log(`❌ Erro: ${product.title} — ${e.message}`);
      errors++;
    }
    await delay(500);
  }

  console.log(`\n📊 Resumo: ${success} criados com sucesso, ${errors} erros`);
}

main();
