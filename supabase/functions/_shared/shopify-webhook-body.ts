import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

// Achado 2026-09-14→25: payloads reais da Shopify (~7 KB) chegam com
// Content-Encoding: gzip. O runtime (Deno.serve) NÃO descomprime — req.text()
// devolvia os bytes gzip crus decodificados como UTF-8 (lixo com U+FFFD), e o
// HMAC calculado sobre esse lixo nunca batia com o header. Resultado: todo
// webhook real era recusado como "Invalid HMAC signature" desde 14/09.
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
