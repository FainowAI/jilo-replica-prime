/**
 * Criptografia RSA-OAEP-SHA256 do cartão VR via WebCrypto — sem dependência.
 * Espelha `normalizePublicKey`/`encryptCardData` de
 * `supabase/functions/_shared/vr-client.ts` (padding oaep-sha256), mas sem
 * `node:crypto` (roda no navegador). Contrato: `.claude/.work/pagamento-vr/plan-04.md`.
 */

export interface VrCardPlain {
  nome: string;
  numero_cartao: string;
  data_expiracao: string;
  cvv: string;
  documento: string;
}

const OAEP_SHA256_MAX_BYTES = 190;

/** Normaliza a chave pública (PEM cru, base64-de-PEM ou base64-de-DER) em DER (SPKI). */
function normalizePublicKeyToDer(publicKeyInput: string): ArrayBuffer {
  const trimmed = publicKeyInput.trim();
  let pem: string;

  if (trimmed.includes("-----BEGIN")) {
    pem = trimmed;
  } else {
    let decoded: string | null = null;
    try {
      decoded = atob(trimmed);
    } catch {
      decoded = null;
    }
    if (decoded && decoded.includes("-----BEGIN")) {
      // base64-de-PEM
      pem = decoded;
    } else {
      // base64-de-DER puro: monta o envelope PEM
      const wrapped = trimmed.match(/.{1,64}/g)?.join("\n") ?? trimmed;
      pem = `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`;
    }
  }

  const b64Body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(b64Body), (c) => c.charCodeAt(0)).buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Criptografa os dados do cartão em RSA-OAEP-SHA256 com a chave pública da
 * VR (base64 recebida de `getVrPublicKey`), retorna base64 do ciphertext.
 * Plaintext = JSON.stringify({nome, numero_cartao, data_expiracao, cvv, documento}).
 */
export async function encryptCard(publicKeyB64: string, card: VrCardPlain): Promise<string> {
  const plaintext = JSON.stringify(card);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  if (plaintextBytes.byteLength > OAEP_SHA256_MAX_BYTES) {
    throw new Error("card_too_long");
  }

  const der = normalizePublicKeyToDer(publicKeyB64);
  const key = await crypto.subtle.importKey("spki", der, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, plaintextBytes);
  return bytesToBase64(new Uint8Array(encrypted));
}
