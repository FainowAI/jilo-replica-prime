/**
 * Leitura/gravação do cart via Shopify Storefront API. Espelha as queries de
 * src/lib/shopify.ts (CART_FULL_QUERY, CART_DISCOUNT_CODES_UPDATE_MUTATION),
 * com campos extras (cost por linha) que o servidor precisa para validar o
 * pagamento VR e o frontend não usa.
 */

const SHOPIFY_STORE_DOMAIN = "jnutg9-u2.myshopify.com";
const SHOPIFY_API_VERSION = "2025-07";
const STOREFRONT_URL = `https://${SHOPIFY_STORE_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;
// ponytail: token Storefront é público por natureza (mesmo valor hardcoded em
// src/lib/shopify.ts); ler de env só permite trocar sem redeploy.
const STOREFRONT_TOKEN =
  Deno.env.get("SHOPIFY_STOREFRONT_TOKEN") ?? "1dd3fbb1a5da220469b791834891450f";

export interface StorefrontCartLine {
  id: string;
  quantity: number;
  merchandiseId: string;
  title: string;
  unitAmountCents: number;
  lineTotalCents: number;
  lineDiscountCents: number;
}

export interface StorefrontCart {
  id: string;
  currencyCode: string;
  totalAmountCents: number;
  subtotalAmountCents: number;
  orderDiscountCents: number;
  discountCodes: Array<{ code: string; applicable: boolean }>;
  lines: StorefrontCartLine[];
}

const CART_FULL_QUERY = `
  query cartFull($id: ID!) {
    cart(id: $id) {
      id
      discountCodes { code applicable }
      discountAllocations {
        discountedAmount { amount currencyCode }
      }
      cost {
        totalAmount { amount currencyCode }
        subtotalAmount { amount currencyCode }
      }
      lines(first: 100) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant { id title }
            }
            cost {
              totalAmount { amount }
              amountPerQuantity { amount }
            }
            discountAllocations {
              discountedAmount { amount }
            }
          }
        }
      }
    }
  }
`;

const CART_DISCOUNT_CODES_UPDATE_MUTATION = `
  mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]) {
    cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
      cart { id }
      userErrors { field message }
    }
  }
`;

interface StorefrontResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

async function storefrontRequest(
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(STOREFRONT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`storefront_http_${res.status}`);
  const json = (await res.json()) as StorefrontResponse;
  if (json.errors && json.errors.length > 0) throw new Error("storefront_graphql_error");
  return json.data ?? {};
}

function centsFromAmount(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

interface RawMoney {
  amount: string;
  currencyCode?: string;
}

interface RawDiscountAllocation {
  discountedAmount: RawMoney;
}

interface RawCartLineNode {
  id: string;
  quantity: number;
  merchandise: { id: string; title: string } | null;
  cost: { totalAmount: RawMoney; amountPerQuantity: RawMoney };
  discountAllocations: RawDiscountAllocation[];
}

interface RawCart {
  id: string;
  discountCodes: Array<{ code: string; applicable: boolean }>;
  discountAllocations: RawDiscountAllocation[];
  cost: { totalAmount: RawMoney; subtotalAmount: RawMoney };
  lines: { edges: Array<{ node: RawCartLineNode }> };
}

function sumDiscountCents(allocations: RawDiscountAllocation[]): number {
  return allocations.reduce((sum, d) => sum + centsFromAmount(d.discountedAmount.amount), 0);
}

function mapCart(raw: RawCart): StorefrontCart {
  const lines: StorefrontCartLine[] = raw.lines.edges.map(({ node }) => ({
    id: node.id,
    quantity: node.quantity,
    merchandiseId: node.merchandise?.id ?? "",
    title: node.merchandise?.title ?? "",
    unitAmountCents: centsFromAmount(node.cost.amountPerQuantity.amount),
    lineTotalCents: centsFromAmount(node.cost.totalAmount.amount),
    lineDiscountCents: sumDiscountCents(node.discountAllocations ?? []),
  }));

  return {
    id: raw.id,
    currencyCode: raw.cost.totalAmount.currencyCode ?? "",
    totalAmountCents: centsFromAmount(raw.cost.totalAmount.amount),
    subtotalAmountCents: centsFromAmount(raw.cost.subtotalAmount.amount),
    orderDiscountCents: sumDiscountCents(raw.discountAllocations ?? []),
    discountCodes: raw.discountCodes ?? [],
    lines,
  };
}

export async function getCart(cartId: string): Promise<StorefrontCart | null> {
  const data = await storefrontRequest(CART_FULL_QUERY, { id: cartId });
  const cart = data.cart as RawCart | null;
  if (!cart) return null;
  return mapCart(cart);
}

export async function applyDiscountCodes(
  cartId: string,
  codes: string[],
): Promise<StorefrontCart | null> {
  await storefrontRequest(CART_DISCOUNT_CODES_UPDATE_MUTATION, { cartId, discountCodes: codes });
  // ponytail: relê via getCart em vez de parsear o retorno da mutation — mesmo
  // shape final, bem menos código de mapeamento duplicado.
  return getCart(cartId);
}
