import { toast } from "sonner";
import { SITE_URL } from "@/config/site";

const SHOPIFY_API_VERSION = '2025-07';
const SHOPIFY_STORE_PERMANENT_DOMAIN = 'jnutg9-u2.myshopify.com';
const SHOPIFY_STOREFRONT_URL = `https://${SHOPIFY_STORE_PERMANENT_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;
const SHOPIFY_STOREFRONT_TOKEN = '1dd3fbb1a5da220469b791834891450f';

export interface ShopifyProduct {
  node: {
    id: string;
    title: string;
    description: string;
    handle: string;
    productType: string;
    tags: string[];
    priceRange: {
      minVariantPrice: {
        amount: string;
        currencyCode: string;
      };
    };
    images: {
      edges: Array<{
        node: {
          url: string;
          altText: string | null;
        };
      }>;
    };
    variants: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          price: {
            amount: string;
            currencyCode: string;
          };
          compareAtPrice: {
            amount: string;
            currencyCode: string;
          } | null;
          availableForSale: boolean;
          selectedOptions: Array<{
            name: string;
            value: string;
          }>;
        };
      }>;
    };
    options: Array<{
      name: string;
      values: string[];
    }>;
  };
}

export async function storefrontApiRequest(query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch(SHOPIFY_STOREFRONT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 402) {
    toast.error("Shopify: Pagamento necessário", {
      description: "Acesse admin.shopify.com para ativar seu plano.",
    });
    return;
  }

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`Shopify error: ${data.errors.map((e: { message: string }) => e.message).join(', ')}`);
  }
  return data;
}

/**
 * Tag interna do produto fantasma de frete (R39/R54). Produtos com essa tag
 * NÃO podem aparecer em listagens de catálogo. O produto fantasma precisa estar
 * ACTIVE + publicado no Online Store pra ser vendável via Storefront API
 * (UNLISTED NÃO é exposto pela Storefront nesta loja — ver R54), então a única
 * forma de mantê-lo fora das listagens é excluí-lo por tag na própria query.
 * Use `excludeInternalShipping(query)` em TODA chamada de PRODUCTS_QUERY que
 * lista catálogo (cardápio, kits, sugestões, favoritos, relacionados).
 */
export const INTERNAL_SHIPPING_TAG = "__internal_shipping";

export function excludeInternalShipping(query?: string): string {
  const exclusion = `-tag:${INTERNAL_SHIPPING_TAG}`;
  return query ? `(${query}) AND ${exclusion}` : exclusion;
}

export const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          description
          handle
          productType
          tags
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 5) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                price {
                  amount
                  currencyCode
                }
                compareAtPrice {
                  amount
                  currencyCode
                }
                availableForSale
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
          options {
            name
            values
          }
        }
      }
    }
  }
`;

export const PRODUCT_BY_HANDLE_QUERY = `
  query GetProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      description
      handle
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      images(first: 5) {
        edges {
          node {
            url
            altText
          }
        }
      }
      variants(first: 10) {
        edges {
          node {
            id
            title
            price {
              amount
              currencyCode
            }
            compareAtPrice {
              amount
              currencyCode
            }
            availableForSale
            selectedOptions {
              name
              value
            }
          }
        }
      }
      tags
      productType
      options {
        name
        values
      }
      metafields(identifiers: [
        { namespace: "custom", key: "proteina" },
        { namespace: "custom", key: "base" },
        { namespace: "custom", key: "guarnicao" },
        { namespace: "custom", key: "alergicos" },
        { namespace: "custom", key: "modo_preparo" },
        { namespace: "custom", key: "peso" },
        { namespace: "custom", key: "conservacao" }
      ]) {
        namespace
        key
        value
        type
      }
    }
  }
`;

export const COLLECTION_BY_HANDLE_QUERY = `
  query GetCollectionByHandle($handle: String!, $first: Int!) {
    collectionByHandle(handle: $handle) {
      id
      title
      handle
      description
      image {
        url
        altText
      }
      products(first: $first) {
        edges {
          node {
            id
            title
            description
            handle
            productType
            tags
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            images(first: 3) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  price {
                    amount
                    currencyCode
                  }
                  compareAtPrice {
                    amount
                    currencyCode
                  }
                  availableForSale
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Cart mutations
const CART_QUERY = `
  query cart($id: ID!) {
    cart(id: $id) { id totalQuantity }
  }
`;

const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
        lines(first: 100) { edges { node { id merchandise { ... on ProductVariant { id } } } } }
      }
      userErrors { field message }
    }
  }
`;

const CART_LINES_ADD_MUTATION = `
  mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        id
        lines(first: 100) { edges { node { id merchandise { ... on ProductVariant { id } } } } }
      }
      userErrors { field message }
    }
  }
`;

const CART_LINES_UPDATE_MUTATION = `
  mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart { id }
      userErrors { field message }
    }
  }
`;

const CART_LINES_REMOVE_MUTATION = `
  mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart { id }
      userErrors { field message }
    }
  }
`;

const CART_DISCOUNT_CODES_UPDATE_MUTATION = `
  mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]) {
    cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
      cart {
        id
        discountCodes {
          code
          applicable
        }
        cost {
          totalAmount {
            amount
            currencyCode
          }
          subtotalAmount {
            amount
            currencyCode
          }
          totalTaxAmount {
            amount
            currencyCode
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CART_WITH_DISCOUNTS_QUERY = `
  query cartWithDiscounts($id: ID!) {
    cart(id: $id) {
      id
      totalQuantity
      discountCodes {
        code
        applicable
      }
      cost {
        totalAmount {
          amount
          currencyCode
        }
        subtotalAmount {
          amount
          currencyCode
        }
      }
    }
  }
`;

function formatCheckoutUrl(checkoutUrl: string): string {
  try {
    const url = new URL(checkoutUrl);
    url.searchParams.set('channel', 'online_store');
    return url.toString();
  } catch {
    return checkoutUrl;
  }
}

/**
 * Enriquece um checkoutUrl da Shopify com `?return_to=<SITE_URL>` para
 * forçar o botão "Continuar comprando" do checkout/thank-you page a
 * retornar ao domínio Jilo, e não ao domínio Shopify default.
 *
 * Aceita query params já existentes (ex: `?channel=online_store` colocado
 * por formatCheckoutUrl). Sobrescreve `return_to` se já existir.
 *
 * Fail-safe: se a URL for inválida, retorna o input intocado.
 *
 * @param checkoutUrl URL bruta do Shopify (cart.checkoutUrl)
 * @param returnTo URL absoluta de destino (default: SITE_URL)
 */
export function appendReturnToCheckoutUrl(
  checkoutUrl: string,
  returnTo: string = SITE_URL
): string {
  try {
    const url = new URL(checkoutUrl);
    url.searchParams.set("return_to", returnTo);
    return url.toString();
  } catch {
    return checkoutUrl;
  }
}

function isCartNotFoundError(userErrors: Array<{ field: string[] | null; message: string }>): boolean {
  return userErrors.some(e => e.message.toLowerCase().includes('cart not found') || e.message.toLowerCase().includes('does not exist'));
}

export async function createShopifyCart(item: { variantId: string; quantity: number }): Promise<{ cartId: string; checkoutUrl: string; lineId: string } | null> {
  const data = await storefrontApiRequest(CART_CREATE_MUTATION, {
    input: { lines: [{ quantity: item.quantity, merchandiseId: item.variantId }] },
  });
  const cart = data?.data?.cartCreate?.cart;
  if (!cart?.checkoutUrl) return null;
  const lineId = cart.lines.edges[0]?.node?.id;
  if (!lineId) return null;
  return { cartId: cart.id, checkoutUrl: formatCheckoutUrl(cart.checkoutUrl), lineId };
}

export async function addLineToShopifyCart(cartId: string, item: { variantId: string; quantity: number }): Promise<{ success: boolean; lineId?: string; cartNotFound?: boolean }> {
  const data = await storefrontApiRequest(CART_LINES_ADD_MUTATION, {
    cartId,
    lines: [{ quantity: item.quantity, merchandiseId: item.variantId }],
  });
  const userErrors = data?.data?.cartLinesAdd?.userErrors || [];
  if (isCartNotFoundError(userErrors)) return { success: false, cartNotFound: true };
  if (userErrors.length > 0) return { success: false };
  const lines = data?.data?.cartLinesAdd?.cart?.lines?.edges || [];
  const newLine = lines.find((l: { node: { id: string; merchandise: { id: string } } }) => l.node.merchandise.id === item.variantId);
  return { success: true, lineId: newLine?.node?.id };
}

export async function updateShopifyCartLine(cartId: string, lineId: string, quantity: number): Promise<{ success: boolean; cartNotFound?: boolean }> {
  const data = await storefrontApiRequest(CART_LINES_UPDATE_MUTATION, {
    cartId,
    lines: [{ id: lineId, quantity }],
  });
  const userErrors = data?.data?.cartLinesUpdate?.userErrors || [];
  if (isCartNotFoundError(userErrors)) return { success: false, cartNotFound: true };
  if (userErrors.length > 0) return { success: false };
  return { success: true };
}

export async function removeLineFromShopifyCart(cartId: string, lineId: string): Promise<{ success: boolean; cartNotFound?: boolean }> {
  const data = await storefrontApiRequest(CART_LINES_REMOVE_MUTATION, {
    cartId,
    lineIds: [lineId],
  });
  const userErrors = data?.data?.cartLinesRemove?.userErrors || [];
  if (isCartNotFoundError(userErrors)) return { success: false, cartNotFound: true };
  if (userErrors.length > 0) return { success: false };
  return { success: true };
}

export async function fetchShopifyCart(cartId: string) {
  const data = await storefrontApiRequest(CART_QUERY, { id: cartId });
  return data?.data?.cart;
}

export async function applyDiscountCodesToCart(
  cartId: string,
  discountCodes: string[]
): Promise<{
  success: boolean;
  discountCodes?: Array<{ code: string; applicable: boolean }>;
  cartNotFound?: boolean;
  cost?: { totalAmount: { amount: string }; subtotalAmount: { amount: string } };
}> {
  const data = await storefrontApiRequest(CART_DISCOUNT_CODES_UPDATE_MUTATION, {
    cartId,
    discountCodes,
  });
  const userErrors = data?.data?.cartDiscountCodesUpdate?.userErrors || [];
  if (isCartNotFoundError(userErrors)) return { success: false, cartNotFound: true };
  if (userErrors.length > 0) return { success: false };
  const cart = data?.data?.cartDiscountCodesUpdate?.cart;
  return {
    success: true,
    discountCodes: cart?.discountCodes || [],
    cost: cart?.cost,
  };
}

export async function removeDiscountCodesFromCart(
  cartId: string
): Promise<{ success: boolean; cartNotFound?: boolean }> {
  const data = await storefrontApiRequest(CART_DISCOUNT_CODES_UPDATE_MUTATION, {
    cartId,
    discountCodes: [],
  });
  const userErrors = data?.data?.cartDiscountCodesUpdate?.userErrors || [];
  if (isCartNotFoundError(userErrors)) return { success: false, cartNotFound: true };
  return { success: true };
}

export async function fetchCartWithDiscounts(cartId: string) {
  const data = await storefrontApiRequest(CART_WITH_DISCOUNTS_QUERY, { id: cartId });
  return data?.data?.cart;
}

export const CART_FULL_QUERY = `
  query cartFull($id: ID!) {
    cart(id: $id) {
      id
      totalQuantity
      checkoutUrl
      discountCodes {
        code
        applicable
      }
      discountAllocations {
        discountedAmount {
          amount
          currencyCode
        }
        ... on CartAutomaticDiscountAllocation {
          title
        }
        ... on CartCodeDiscountAllocation {
          code
        }
      }
      cost {
        totalAmount {
          amount
          currencyCode
        }
        subtotalAmount {
          amount
          currencyCode
        }
        totalTaxAmount {
          amount
          currencyCode
        }
      }
      lines(first: 100) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                id
                title
                price {
                  amount
                  currencyCode
                }
                product {
                  title
                  handle
                  productType
                  images(first: 1) {
                    edges {
                      node {
                        url
                      }
                    }
                  }
                }
              }
            }
            discountAllocations {
              discountedAmount {
                amount
                currencyCode
              }
              ... on CartAutomaticDiscountAllocation {
                title
              }
              ... on CartCodeDiscountAllocation {
                code
              }
            }
          }
        }
      }
    }
  }
`;

const CART_ATTRIBUTES_UPDATE_MUTATION = `
  mutation cartAttributesUpdate($cartId: ID!, $attributes: [AttributeInput!]!) {
    cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
      cart { id }
      userErrors { field message }
    }
  }
`;

export async function setCartAttributes(
  cartId: string,
  attributes: Array<{ key: string; value: string }>
): Promise<{ success: boolean }> {
  const data = await storefrontApiRequest(CART_ATTRIBUTES_UPDATE_MUTATION, {
    cartId,
    attributes,
  });
  const userErrors = data?.data?.cartAttributesUpdate?.userErrors || [];
  if (userErrors.length > 0) {
    console.error("setCartAttributes errors:", userErrors);
    return { success: false };
  }
  return { success: true };
}

const CART_BUYER_IDENTITY_UPDATE_MUTATION = `
  mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
      cart { id }
      userErrors { field message }
    }
  }
`;

interface CartDeliveryAddressInput {
  recipient_name: string | null;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
}

function splitRecipientName(fullName: string | null | undefined): { firstName: string | null; lastName: string | null } {
  if (!fullName || !fullName.trim()) return { firstName: null, lastName: null };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// Envia o endereço selecionado como prefill do checkout (deliveryAddressPreferences via
// cartBuyerIdentityUpdate) — vira o shipping_address do pedido na Shopify. O attribute
// selected_address_id (setCartAttributes) continua sendo gravado à parte para sync futuro.
// ponytail: phone fica de fora (tabela addresses não tem telefone; upgrade: profile.phone se o Uber precisar dele).
export async function setCartDeliveryAddress(
  cartId: string,
  address: CartDeliveryAddressInput
): Promise<{ success: boolean }> {
  if (!address.street || !address.cep) {
    return { success: false };
  }
  const { firstName, lastName } = splitRecipientName(address.recipient_name);
  const address1 = [address.street, address.number].filter(Boolean).join(", ");
  const address2 = [address.complement, address.neighborhood]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" - ") || undefined;

  const data = await storefrontApiRequest(CART_BUYER_IDENTITY_UPDATE_MUTATION, {
    cartId,
    buyerIdentity: {
      countryCode: "BR",
      deliveryAddressPreferences: [
        {
          deliveryAddress: {
            firstName,
            lastName,
            address1,
            address2,
            city: address.city,
            province: address.state,
            zip: address.cep,
            country: "BR",
          },
          deliveryAddressValidationStrategy: "COUNTRY_CODE_ONLY",
        },
      ],
    },
  });
  const userErrors = data?.data?.cartBuyerIdentityUpdate?.userErrors || [];
  if (userErrors.length > 0) {
    console.error("setCartDeliveryAddress errors:", userErrors);
    return { success: false };
  }
  return { success: true };
}

export async function fetchCartFull(cartId: string) {
  const data = await storefrontApiRequest(CART_FULL_QUERY, { id: cartId });
  return data?.data?.cart;
}
