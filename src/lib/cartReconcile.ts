import type { CartItem } from '@/stores/cartStore';
import type { ShopifyProduct } from '@/lib/shopify';
import { isShippingVariant } from '@/config/shipping';

/** Linha do cart como devolvida por `fetchCartFull` (só o que a conciliação usa). */
export interface ServerCartLine {
  id: string;
  quantity: number;
  merchandise: {
    id?: string;
    title?: string;
    price?: { amount: string; currencyCode: string };
    selectedOptions?: Array<{ name: string; value: string }>;
    product?: {
      id?: string;
      title?: string;
      handle?: string;
      productType?: string;
      tags?: string[];
      images?: { edges: Array<{ node: { url: string; altText?: string | null } }> };
    };
  };
}

export type CartAdjustmentKind = 'removed' | 'reduced' | 'changed';

export interface CartAdjustment {
  variantId: string;
  title: string;
  from: number;
  to: number;
  kind: CartAdjustmentKind;
}

export interface ReconcileResult {
  items: CartItem[];
  adjustments: CartAdjustment[];
  /** Linhas com quantity 0 no servidor, a remover da Shopify. */
  zeroLineIds: string[];
}

function buildItemFromServerLine(line: ServerCartLine): CartItem | null {
  const m = line.merchandise;
  if (!m?.id || !m.price || !m.product) return null;
  const p = m.product;
  const selectedOptions = m.selectedOptions ?? [];
  const product: ShopifyProduct = {
    node: {
      id: p.id ?? '',
      title: p.title ?? '',
      description: '',
      handle: p.handle ?? '',
      productType: p.productType ?? '',
      tags: p.tags ?? [],
      priceRange: { minVariantPrice: m.price },
      images: {
        edges: (p.images?.edges ?? []).map((e) => ({
          node: { url: e.node.url, altText: e.node.altText ?? null },
        })),
      },
      variants: {
        edges: [
          {
            node: {
              id: m.id,
              title: m.title ?? '',
              price: m.price,
              compareAtPrice: null,
              availableForSale: true,
              selectedOptions,
            },
          },
        ],
      },
      options: [],
    },
  };
  return {
    lineId: line.id,
    product,
    variantId: m.id,
    variantTitle: m.title ?? '',
    price: m.price,
    quantity: line.quantity,
    selectedOptions,
  };
}

/**
 * Concilia os itens locais com as linhas do cart na Shopify (a Shopify é a
 * verdade). A variant fantasma de frete fica fora: itens e linhas de frete
 * passam intactos / são ignorados. Função pura.
 *
 * Invariante: soma das quantidades não-frete do resultado = soma do servidor.
 */
export function reconcileCartItems(
  localItems: CartItem[],
  serverLines: ServerCartLine[]
): ReconcileResult {
  const adjustments: CartAdjustment[] = [];
  const zeroLineIds: string[] = [];

  const lines = serverLines.filter((l) => !isShippingVariant(l.merchandise?.id));
  for (const l of lines) if (l.quantity <= 0) zeroLineIds.push(l.id);

  const lineById = new Map(lines.map((l) => [l.id, l]));
  const lineByVariant = new Map<string, ServerCartLine>();
  for (const l of lines) {
    const vid = l.merchandise?.id;
    // Prefere a linha com quantity>0 se houver duplicatas da mesma variant.
    if (vid && (!lineByVariant.has(vid) || lineByVariant.get(vid)!.quantity <= 0)) {
      lineByVariant.set(vid, l);
    }
  }

  const usedLineIds = new Set<string>();
  const result: CartItem[] = [];

  for (const item of localItems) {
    if (isShippingVariant(item.variantId)) {
      result.push(item);
      continue;
    }
    let line = item.lineId ? lineById.get(item.lineId) : undefined;
    if (!line || usedLineIds.has(line.id)) line = lineByVariant.get(item.variantId);
    if (line && usedLineIds.has(line.id)) line = undefined;

    const title = item.product?.node?.title || item.variantTitle || item.variantId;
    if (!line || line.quantity <= 0) {
      adjustments.push({ variantId: item.variantId, title, from: item.quantity, to: 0, kind: 'removed' });
      continue;
    }
    usedLineIds.add(line.id);
    if (line.quantity !== item.quantity) {
      adjustments.push({
        variantId: item.variantId,
        title,
        from: item.quantity,
        to: line.quantity,
        kind: line.quantity < item.quantity ? 'reduced' : 'changed',
      });
    }
    result.push({ ...item, lineId: line.id, quantity: line.quantity });
  }

  // Linhas do servidor (qty>0) sem item local: inclui para manter o invariante.
  for (const line of lines) {
    if (line.quantity <= 0 || usedLineIds.has(line.id)) continue;
    const built = buildItemFromServerLine(line);
    if (!built) continue;
    usedLineIds.add(line.id);
    result.push(built);
    adjustments.push({
      variantId: built.variantId,
      title: built.product.node.title || built.variantTitle,
      from: 0,
      to: built.quantity,
      kind: 'changed',
    });
  }

  return { items: result, adjustments, zeroLineIds };
}

/** Mensagem de toast por ajuste (decisão de negócio aprovada). */
export function adjustmentMessage(a: CartAdjustment): string {
  if (a.kind === 'removed') return `${a.title} ficou sem estoque e saiu do carrinho.`;
  if (a.kind === 'reduced') {
    return `${a.title}: só havia ${a.to} unidade${a.to === 1 ? '' : 's'} disponíve${a.to === 1 ? 'l' : 'is'}.`;
  }
  return `${a.title}: quantidade atualizada para ${a.to} no carrinho.`;
}
