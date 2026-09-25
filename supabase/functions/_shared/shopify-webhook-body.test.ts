import { assertEquals, assert } from "jsr:@std/assert";
import { readRawBody, verifyShopifyHmac } from "./shopify-webhook-body.ts";

const SECRET = "test-secret";

async function signHmac(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([new TextEncoder().encode(text)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

const SAMPLE_JSON = JSON.stringify({ id: 1012, total_price: "79.00", line_items: [{ id: 1, quantity: 2 }] });

Deno.test("readRawBody: body plain devolve o JSON idêntico", async () => {
  const req = new Request("http://local/webhook", { method: "POST", body: SAMPLE_JSON });
  const result = await readRawBody(req);
  assertEquals(result, SAMPLE_JSON);
});

Deno.test("readRawBody: body gzip devolve o JSON idêntico ao original", async () => {
  const compressed = await gzip(SAMPLE_JSON);
  const req = new Request("http://local/webhook", {
    method: "POST",
    headers: { "content-encoding": "gzip" },
    body: compressed,
  });
  const result = await readRawBody(req);
  assertEquals(result, SAMPLE_JSON);
  assert(!result.includes("�"));
  assert(result.startsWith("{"));
});

Deno.test("verifyShopifyHmac: bate após descompressão gzip, falha com secret errado", async () => {
  const sig = await signHmac(SAMPLE_JSON, SECRET);
  const compressed = await gzip(SAMPLE_JSON);
  const req = new Request("http://local/webhook", {
    method: "POST",
    headers: { "content-encoding": "gzip" },
    body: compressed,
  });
  const body = await readRawBody(req);
  assertEquals(await verifyShopifyHmac(body, sig, SECRET), true);
  assertEquals(await verifyShopifyHmac(body, sig, "wrong-secret"), false);
});

Deno.test("readRawBody: header gzip com corpo não comprimido não lança, devolve os bytes crus", async () => {
  const req = new Request("http://local/webhook", {
    method: "POST",
    headers: { "content-encoding": "gzip" },
    body: SAMPLE_JSON,
  });
  const result = await readRawBody(req);
  assertEquals(result, SAMPLE_JSON);
});

Deno.test("verifyShopifyHmac: header com base64 inválido devolve false sem lançar", async () => {
  const invalid = await verifyShopifyHmac(SAMPLE_JSON, "!!!not-base64!!!", SECRET);
  assertEquals(invalid, false);
});

Deno.test("readRawBody: header content-encoding em maiúsculo (GZIP) também funciona", async () => {
  const compressed = await gzip(SAMPLE_JSON);
  const req = new Request("http://local/webhook", {
    method: "POST",
    headers: { "content-encoding": "GZIP" },
    body: compressed,
  });
  const result = await readRawBody(req);
  assertEquals(result, SAMPLE_JSON);
});
