/**
 * VR (Vale Refeição) FALSA em processo — substitui a API real da VR para o
 * harness `vr-checkout-e2e-local.ts`. NENHUMA chamada sai para a rede da VR:
 * este módulo responde diretamente pelas URLs `*.vr.com.br`, com um par RSA
 * gerado em memória, e é consumido via `createFakeVr().handle(url, init)`
 * dentro do interceptor de `fetch` do harness.
 *
 * Espelha o vocabulário do Swagger da API Captura 2.4.0 usado por
 * `../_shared/vr-client.ts` (mesmos shapes de `TransacaoAutorizada`,
 * `ConsultaTransacao`) — mas não importa nada de lá: é um dublê, não um
 * cliente.
 *
 * Nunca logar/gravar: PAN, CVV, nome, documento, validade ou o blob
 * cifrado. Log só `[fake-vr] <etapa>` + metadados não sensíveis (padding,
 * booleans de validação, ids).
 */
import {
  privateDecrypt as nodePrivateDecrypt,
  constants as nodeConstants,
  generateKeyPairSync,
} from "node:crypto";
import { Buffer } from "node:buffer";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type FakeVrOutcome = "approve" | `decline:${string}` | "timeout";

export type FakeVrTransactionStatus = "PENDENTE" | "CONFIRMADA" | "CANCELADA" | "NEGADA";

export interface FakeVrPaymentRecord {
  id_transacao: string;
  id_transacao_van: string;
  valor: number;
  status: FakeVrTransactionStatus;
  padding: "oaep-sha256" | "pkcs1";
}

export interface FakeVrRefundRecord {
  id_transacao: string;
  valor: number;
}

export interface FakeVrState {
  /** Consumido (e resetado para "approve") a cada POST /transacoes/pagamentos. */
  nextOutcome: FakeVrOutcome;
  payments: FakeVrPaymentRecord[];
  refunds: FakeVrRefundRecord[];
  keyId: string;
  publicKeyBase64Der: string;
}

export interface FakeVr {
  /** `null` = a URL não é da VR — o caller deve seguir para o fetch real. */
  handle(url: string, init?: RequestInit): Promise<Response> | null;
  state: FakeVrState;
}

// ---------------------------------------------------------------------------
// Timeout de captura (espelha VR_TIMEOUT_MS de vr-client.ts, sem importar de lá
// pra manter o dublê independente do cliente que ele substitui).
// ---------------------------------------------------------------------------

const FAKE_TIMEOUT_RESPONSE_MS = 31_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isVrHost(hostname: string): boolean {
  return hostname === "vr.com.br" || hostname.endsWith(".vr.com.br");
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function bodyOf(init: RequestInit | undefined): string {
  if (!init?.body) return "";
  if (typeof init.body === "string") return init.body;
  return String(init.body);
}

/** Decifra tentando OAEP-SHA256 primeiro, cai para PKCS#1 v1.5 — mesmo fallback do runner de homologação. */
function tryDecrypt(privateKeyPem: string, cipherB64: string): { plaintext: string; padding: "oaep-sha256" | "pkcs1" } | null {
  const cipher = Buffer.from(cipherB64, "base64");
  try {
    const plain = nodePrivateDecrypt(
      { key: privateKeyPem, padding: nodeConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      cipher,
    );
    return { plaintext: plain.toString("utf8"), padding: "oaep-sha256" };
  } catch {
    // segue para PKCS1
  }
  try {
    const plain = nodePrivateDecrypt({ key: privateKeyPem, padding: nodeConstants.RSA_PKCS1_PADDING }, cipher);
    return { plaintext: plain.toString("utf8"), padding: "pkcs1" };
  } catch {
    return null;
  }
}

interface FakeCardFields {
  nome?: unknown;
  numero_cartao?: unknown;
  data_expiracao?: unknown;
  cvv?: unknown;
  documento?: unknown;
}

function validateCardFields(card: FakeCardFields): boolean {
  const nomeOk = typeof card.nome === "string" && card.nome.trim().length > 0;
  const numeroOk = typeof card.numero_cartao === "string" && /^\d{16}$/.test(card.numero_cartao);
  const dataOk = typeof card.data_expiracao === "string" && /^\d{4}$/.test(card.data_expiracao);
  const cvvOk = typeof card.cvv === "string" && /^\d{3}$/.test(card.cvv);
  const documentoOk = typeof card.documento === "string" && /^\d{11}$/.test(card.documento);
  return nomeOk && numeroOk && dataOk && cvvOk && documentoOk;
}

let idSeq = 0;
function nextTransactionId(): string {
  idSeq += 1;
  return `fake-tx-${idSeq}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFakeVr(): FakeVr {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  // encryptCardData / rsa.ts (front) aceitam base64-de-DER puro sem envelope PEM.
  const publicKeyBase64Der = Buffer.from(publicKey as Buffer).toString("base64");

  const state: FakeVrState = {
    nextOutcome: "approve",
    payments: [],
    refunds: [],
    keyId: "fake-key-1",
    publicKeyBase64Der,
  };

  function findPaymentByIdOrVan(idOrVan: string): FakeVrPaymentRecord | undefined {
    return state.payments.find((p) => p.id_transacao === idOrVan || p.id_transacao_van === idOrVan);
  }

  async function handleGrantCode(): Promise<Response> {
    return json({ redirect_uri: "http://localhost/?code=fake" }, 200);
  }

  async function handleAccessToken(): Promise<Response> {
    return json({ access_token: "fake-access-token", refresh_token: "fake-refresh-token", expires_in: 3600 }, 200);
  }

  async function handlePublicKey(): Promise<Response> {
    return json({ key_id: state.keyId, public_key: state.publicKeyBase64Der }, 200);
  }

  async function handleCreatePayment(init: RequestInit | undefined): Promise<Response> {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(bodyOf(init));
    } catch {
      return json({ codigo: "63", mensagem: "corpo invalido" }, 400);
    }

    const cipherB64 = payload.cartao_dados_criptografados;
    if (typeof cipherB64 !== "string" || !cipherB64) {
      return json({ codigo: "63", mensagem: "cartao ausente" }, 400);
    }

    const decrypted = tryDecrypt(privateKey as string, cipherB64);
    if (!decrypted) {
      console.log("[fake-vr] captura decrypt falhou padding=nenhum campos_ok=false");
      return json({ codigo: "63", mensagem: "nao foi possivel decifrar" }, 400);
    }

    let card: FakeCardFields;
    try {
      card = JSON.parse(decrypted.plaintext);
    } catch {
      console.log(`[fake-vr] captura decrypt padding=${decrypted.padding} campos_ok=false (json invalido)`);
      return json({ codigo: "63", mensagem: "json invalido" }, 400);
    }

    const camposOk = validateCardFields(card);
    console.log(`[fake-vr] captura decrypt padding=${decrypted.padding} campos_ok=${camposOk}`);
    if (!camposOk) {
      return json({ codigo: "63", mensagem: "dados do cartao invalidos" }, 400);
    }

    const idTransacaoVan = typeof payload.id_transacao_van === "string" ? payload.id_transacao_van : nextTransactionId();
    const valor = typeof payload.valor === "number" ? payload.valor : 0;

    // Consumido por chamada — a próxima chamada volta ao default "approve".
    const outcome = state.nextOutcome;
    state.nextOutcome = "approve";

    if (outcome === "timeout") {
      const idTransacao = nextTransactionId();
      state.payments.push({
        id_transacao: idTransacao,
        id_transacao_van: idTransacaoVan,
        valor,
        status: "CONFIRMADA",
        padding: decrypted.padding,
      });
      return await new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(json({ id_transacao: idTransacao, valor, codigo_retorno: "00", codigo_autorizacao: "123456" }, 201));
        }, FAKE_TIMEOUT_RESPONSE_MS);
        const signal = init?.signal;
        if (signal) {
          if (signal.aborted) {
            clearTimeout(timer);
            reject(new DOMException("aborted", "AbortError"));
            return;
          }
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("aborted", "AbortError"));
            },
            { once: true },
          );
        }
      });
    }

    const idTransacao = nextTransactionId();
    if (outcome.startsWith("decline:")) {
      const codigoRetorno = outcome.slice("decline:".length);
      state.payments.push({ id_transacao: idTransacao, id_transacao_van: idTransacaoVan, valor, status: "NEGADA", padding: decrypted.padding });
      return json({ id_transacao: idTransacao, valor, codigo_retorno: codigoRetorno }, 201);
    }

    // approve
    state.payments.push({ id_transacao: idTransacao, id_transacao_van: idTransacaoVan, valor, status: "CONFIRMADA", padding: decrypted.padding });
    return json({ id_transacao: idTransacao, valor, codigo_retorno: "00", codigo_autorizacao: "123456" }, 201);
  }

  async function handleGetTransaction(idOrVan: string): Promise<Response> {
    const record = findPaymentByIdOrVan(idOrVan);
    if (!record) return json({ codigo: "04", mensagem: "transacao nao encontrada" }, 404);
    return json(
      { id_transacao: record.id_transacao, id_transacao_van: record.id_transacao_van, valor: record.valor, status: record.status },
      200,
    );
  }

  async function handleRefund(idTransacao: string, init: RequestInit | undefined): Promise<Response> {
    const record = findPaymentByIdOrVan(idTransacao);
    if (!record) return json({ codigo: "04", mensagem: "transacao nao encontrada" }, 404);
    let valor = record.valor;
    try {
      const payload = JSON.parse(bodyOf(init));
      if (typeof payload.valor === "number") valor = payload.valor;
    } catch {
      // corpo ausente/invalido: usa o valor total já registrado
    }
    record.status = "CANCELADA";
    state.refunds.push({ id_transacao: record.id_transacao, valor });
    return json({ id_transacao: record.id_transacao, valor, codigo_retorno: "00" }, 201);
  }

  function handle(url: string, init?: RequestInit): Promise<Response> | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (!isVrHost(parsed.hostname)) return null;

    const path = parsed.pathname;
    const method = (init?.method ?? "GET").toUpperCase();

    if (method === "POST" && path === "/oauth/grant-code") return handleGrantCode();
    if (method === "POST" && path === "/oauth/access-token") return handleAccessToken();
    if (method === "GET" && path === "/captura/v2/chaves/chave-publica") return handlePublicKey();
    if (method === "POST" && path === "/captura/v2/transacoes/pagamentos") return handleCreatePayment(init);

    const getMatch = path.match(/^\/captura\/v2\/transacoes\/pagamentos\/([^/]+)$/);
    if (method === "GET" && getMatch) return handleGetTransaction(decodeURIComponent(getMatch[1]));

    const refundMatch = path.match(/^\/captura\/v2\/transacoes\/pagamentos\/([^/]+)\/estornos$/);
    if (method === "POST" && refundMatch) return handleRefund(decodeURIComponent(refundMatch[1]), init);

    return Promise.resolve(json({ codigo: "99", mensagem: "rota nao encontrada na VR falsa" }, 404));
  }

  return { handle, state };
}
