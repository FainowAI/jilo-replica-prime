import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

// Leitura robusta do body de um webhook assinado: lê os BYTES (arrayBuffer), descomprime
// se o provedor mandar Content-Encoding gzip/deflate (o runtime Deno não descomprime
// sozinho — req.text() devolveria os bytes comprimidos como UTF-8 inválido) e só então
// decodifica. Hoje a Shopify envia os pedidos (~7 KB) SEM compressão (verificado em
// produção em 2026-09-25: enc=none, JSON íntegro); a descompressão é defesa para o dia
// em que ela passar a comprimir. Nunca loga o conteúdo.
export async function readRawBody(req: Request): Promise<string> {
  const buf = await req.arrayBuffer();
  const encoding = (req.headers.get("content-encoding") || "").toLowerCase();

  let bytes: Uint8Array = new Uint8Array(buf);
  if (encoding.includes("gzip") || encoding.includes("deflate")) {
    const format = encoding.includes("gzip") ? "gzip" : "deflate";
    try {
      const decompressed = await new Response(
        new Blob([buf]).stream().pipeThrough(new DecompressionStream(format))
      ).arrayBuffer();
      bytes = new Uint8Array(decompressed);
    } catch {
      // corpo com header de encoding mas não realmente comprimido (ou corrompido):
      // segue com os bytes crus — o HMAC abaixo vai recusar (401), fail-closed preservado.
      console.error(
        `[shopify-webhook-receiver] falha ao descomprimir (encoding=${encoding}, len=${bytes.length})`
      );
    }
  }

  const body = new TextDecoder().decode(bytes);
  if (!/^[{[]/.test(body.trimStart())) {
    console.error(
      `[shopify-webhook-receiver] body inesperado (encoding=${encoding || "none"}, len=${bytes.length})`
    );
  }
  return body;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Achado 2026-09-25 (causa real do "Invalid HMAC" desde a v37 de 14/09): o app Shopify
// tinha DUAS chaves secretas ativas (Antiga 03/03, Nova 27/05); a Shopify assina os
// webhooks com a Antiga e o cofre do Supabase tinha a Nova. Provado recalculando o HMAC
// sobre o body real capturado: só a Antiga bate. Correção é operacional (revogar a chave
// que a Shopify não deve usar, ou alinhar o cofre), não de código.
export async function verifyShopifyHmac(
  body: string,
  hmacHeader: string,
  secret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));

  let headerBytes: Uint8Array;
  try {
    headerBytes = Uint8Array.from(atob(hmacHeader), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  return timingSafeEqual(new Uint8Array(signature), headerBytes);
}
