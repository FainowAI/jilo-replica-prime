/**
 * Cliente da API Captura da VR (Vale Refeição) — spike do ticket 01 do plano
 * `pagamento-vr`. Autentica (OAuth grant-code → access-token, com refresh),
 * busca a chave pública, cria pagamento, consulta e estorna.
 *
 * Padrão copiado de `_shared/shopify-admin-auth.ts` (cache + refresh de
 * token) e do `callShopifyAdmin` de `customer-orders/index.ts` (retry único
 * em 401). Diferença deliberada: aqui o cache é uma variável de módulo, não
 * uma tabela — ponytail: cache em módulo; mover pra tabela só se o
 * grant-code tiver rate limit que exija sobreviver a cold starts frequentes.
 *
 * Nunca logar: body de request/response, número/CVV de cartão, CPF,
 * `access_token`, `refresh_token` ou `client_secret`. Log = método, path,
 * status HTTP e `codigo_retorno` (quando aplicável).
 *
 * Contrato completo: `.claude/.work/pagamento-vr/vr-api-notes.md`.
 */

import { publicEncrypt as nodePublicEncrypt, constants as nodeConstants } from "node:crypto";

// ---------------------------------------------------------------------------
// Ambiente / hosts
// ---------------------------------------------------------------------------

type VrEnv = "mock" | "hml" | "prod";

const VR_CAPTURE_HOSTS: Record<VrEnv, string> = {
  mock: "https://api-devportal.vr.com.br/captura/v2",
  hml: "https://api-hmp.vr.com.br/captura/v2",
  prod: "https://api.vr.com.br/captura/v2",
};

// ponytail: mesmo host de OAuth para os três ambientes — HML pode ter host
// próprio, confirmar no ticket 00 antes de ligar VR_ENV=hml de verdade.
const VR_OAUTH_BASE = "https://api.vr.com.br";

let vrEnvLogged = false;

/**
 * Lê e valida VR_ENV a cada chamada (nunca no escopo do módulo) — assim
 * `deno check`/import nunca quebra por env ausente, e o erro só aparece na
 * primeira chamada real. Loga o ambiente (sem segredo) uma vez por processo.
 */
function getVrEnv(): VrEnv {
  const raw = Deno.env.get("VR_ENV");
  if (raw !== "mock" && raw !== "hml" && raw !== "prod") {
    throw new Error(`VR_ENV inválido ou ausente: "${raw ?? ""}". Use mock, hml ou prod.`);
  }
  if (!vrEnvLogged) {
    console.log(`[vr] env=${raw}`);
    vrEnvLogged = true;
  }
  return raw;
}

function getVrCaptureBase(): string {
  return VR_CAPTURE_HOSTS[getVrEnv()];
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Env var ${name} não configurada.`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Erro
// ---------------------------------------------------------------------------

/** Vocabulário interno fechado — nunca o corpo bruto da resposta da VR. */
export type VrErrorCode = "vr_timeout" | "vr_unauthorized" | `vr_http_${number}` | "vr_bad_response";

export class VrApiError extends Error {
  status?: number;
  codigo?: string;
  mensagem?: string;
  code: VrErrorCode;

  constructor(params: { status?: number; codigo?: string; mensagem?: string; code: VrErrorCode }) {
    super(params.mensagem ?? params.code);
    this.name = "VrApiError";
    this.status = params.status;
    this.codigo = params.codigo;
    this.mensagem = params.mensagem;
    this.code = params.code;
  }
}

// ---------------------------------------------------------------------------
// OAuth: grant-code → access-token, cache em módulo, refresh
// ---------------------------------------------------------------------------

interface VrTokenCache {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
}

let tokenCache: VrTokenCache | null = null;

// Margem de segurança contra expirar entre o check e o uso do token.
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

function basicAuth(clientId: string, clientSecret: string): string {
  return btoa(`${clientId}:${clientSecret}`);
}

async function requestGrantCode(clientId: string): Promise<string> {
  const res = await fetch(`${VR_OAUTH_BASE}/oauth/grant-code`, {
    method: "POST",
    // O gateway Sensedia exige client_id também como header, além do body.
    headers: { "Content-Type": "application/json", client_id: clientId },
    body: JSON.stringify({ client_id: clientId, redirect_uri: "http://localhost/" }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[vr] POST /oauth/grant-code -> ${res.status}`);
    throw new VrApiError({ status: res.status, code: res.status === 401 ? "vr_unauthorized" : `vr_http_${res.status}` });
  }
  let data: { redirect_uri?: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new VrApiError({ code: "vr_bad_response" });
  }
  const code = data.redirect_uri ? new URL(data.redirect_uri).searchParams.get("code") : null;
  if (!code) throw new VrApiError({ code: "vr_bad_response" });
  return code;
}

async function requestAccessToken(
  clientId: string,
  clientSecret: string,
  grant: { grant_type: "authorization_code"; code: string } | { grant_type: "refresh_token"; refresh_token: string },
): Promise<VrTokenCache> {
  const res = await fetch(`${VR_OAUTH_BASE}/oauth/access-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // ponytail: client_id como header só foi confirmado no grant-code; mandamos
      // também aqui por segurança (o notes.md fala em "nas chamadas de OAuth" no
      // plural) — não observado quebrar, remover se a VR confirmar que não precisa.
      client_id: clientId,
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
    },
    body: JSON.stringify(grant),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[vr] POST /oauth/access-token -> ${res.status}`);
    throw new VrApiError({ status: res.status, code: res.status === 401 ? "vr_unauthorized" : `vr_http_${res.status}` });
  }
  let data: { access_token?: string; refresh_token?: string; expires_in?: number };
  try {
    data = JSON.parse(text);
  } catch {
    throw new VrApiError({ code: "vr_bad_response" });
  }
  if (!data.access_token || !data.refresh_token) {
    throw new VrApiError({ code: "vr_bad_response" });
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

async function grantAndFetchToken(): Promise<string> {
  const clientId = requireEnv("VR_CLIENT_ID");
  const clientSecret = requireEnv("VR_CLIENT_SECRET");
  const code = await requestGrantCode(clientId);
  const token = await requestAccessToken(clientId, clientSecret, { grant_type: "authorization_code", code });
  tokenCache = token;
  return token.access_token;
}

async function refreshWithToken(refreshToken: string): Promise<string> {
  const clientId = requireEnv("VR_CLIENT_ID");
  const clientSecret = requireEnv("VR_CLIENT_SECRET");
  try {
    const token = await requestAccessToken(clientId, clientSecret, { grant_type: "refresh_token", refresh_token: refreshToken });
    tokenCache = token;
    return token.access_token;
  } catch (err) {
    // refresh_token expirado/revogado: a VR recusa (401, às vezes 400 invalid_grant).
    // Sem isso, o cache fica preso num refresh_token morto até o isolate reiniciar —
    // limpa o cache e refaz o fluxo completo de grant-code em vez de propagar o erro.
    if (err instanceof VrApiError && (err.code === "vr_unauthorized" || err.status === 400)) {
      console.warn("[vr] refresh recusado, refazendo grant-code");
      tokenCache = null;
      return await grantAndFetchToken();
    }
    throw err;
  }
}

/** Obtém um access_token válido, reutilizando o cache de módulo quando possível. */
export async function getVrAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expires_at - TOKEN_EXPIRY_MARGIN_MS > now) {
    return tokenCache.access_token;
  }
  if (tokenCache?.refresh_token) {
    return await refreshWithToken(tokenCache.refresh_token);
  }
  return await grantAndFetchToken();
}

/** Força renovação do token, ignorando validade do cache. Usado no retry de 401. */
export async function forceRefreshVrAccessToken(): Promise<string> {
  if (tokenCache?.refresh_token) {
    return await refreshWithToken(tokenCache.refresh_token);
  }
  return await grantAndFetchToken();
}

// ---------------------------------------------------------------------------
// Chamada genérica à API Captura
// ---------------------------------------------------------------------------

export const VR_TIMEOUT_MS = 30_000;

/** Faz uma chamada à API Captura injetando auth, timeout e retry único em 401. */
export async function vrFetch<T = unknown>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
  const clientId = requireEnv("VR_CLIENT_ID");
  const token = await getVrAccessToken();
  const method = init.method ?? "GET";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VR_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${getVrCaptureBase()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        client_id: clientId,
        access_token: token,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      console.error(`[vr] ${method} ${path} -> timeout`);
      throw new VrApiError({ code: "vr_timeout" });
    }
    // ponytail: vocabulário fechado no ticket 01 (timeout/401/http/bad_response);
    // falha de rede pura (DNS, conexão recusada) é rara aqui e cai em
    // vr_bad_response — promover pra um vr_network dedicado se aparecer em prod.
    console.error(`[vr] ${method} ${path} -> network_error`);
    throw new VrApiError({ code: "vr_bad_response" });
  } finally {
    clearTimeout(timeoutId);
  }

  // Retry único em 401 (token revogado/expirado server-side); nunca em timeout/5xx.
  if (res.status === 401 && !isRetry) {
    console.warn(`[vr] ${method} ${path} -> 401, forçando refresh e repetindo uma vez`);
    await forceRefreshVrAccessToken();
    return vrFetch<T>(path, init, true);
  }

  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }

  if (!res.ok) {
    const b = (body ?? {}) as { codigo?: string; mensagem?: string };
    console.error(`[vr] ${method} ${path} -> ${res.status}${b.codigo ? ` codigo=${b.codigo}` : ""}`);
    throw new VrApiError({
      status: res.status,
      codigo: b.codigo,
      mensagem: b.mensagem,
      code: res.status === 401 ? "vr_unauthorized" : `vr_http_${res.status}`,
    });
  }

  console.log(`[vr] ${method} ${path} -> ${res.status}`);
  return (body ?? {}) as T;
}

// ---------------------------------------------------------------------------
// Chave pública (cache em módulo, TTL 10 min)
// ---------------------------------------------------------------------------

interface PublicKeyCacheEntry {
  key_id: string;
  public_key: string;
  fetched_at: number;
}

let publicKeyCache: PublicKeyCacheEntry | null = null;
const PUBLIC_KEY_TTL_MS = 10 * 60 * 1000;

export async function getPublicKey(): Promise<{ key_id: string; public_key: string }> {
  const now = Date.now();
  if (publicKeyCache && now - publicKeyCache.fetched_at < PUBLIC_KEY_TTL_MS) {
    return { key_id: publicKeyCache.key_id, public_key: publicKeyCache.public_key };
  }
  const data = await vrFetch<{ key_id: string; public_key: string }>("/chaves/chave-publica");
  publicKeyCache = { key_id: data.key_id, public_key: data.public_key, fetched_at: now };
  return { key_id: data.key_id, public_key: data.public_key };
}

export function invalidatePublicKeyCache(): void {
  publicKeyCache = null;
}

// ---------------------------------------------------------------------------
// Pagamento / consulta / estorno
// ---------------------------------------------------------------------------

export interface TransacaoAutorizada {
  id_transacao: string;
  valor: number;
  codigo_retorno: string;
  codigo_autorizacao?: string;
  mensagem?: string;
}

export async function createPayment(params: {
  valorCents: number;
  idTransacaoVan: string;
  keyId: string;
  cardEncrypted: string;
}): Promise<TransacaoAutorizada> {
  const idFiliacao = requireEnv("VR_ID_FILIACAO");
  return await vrFetch<TransacaoAutorizada>("/transacoes/pagamentos", {
    method: "POST",
    body: JSON.stringify({
      valor: params.valorCents,
      id_filiacao: idFiliacao,
      id_transacao_van: params.idTransacaoVan,
      quantidade_parcelas: 1,
      key_id: params.keyId,
      cartao_dados_criptografados: params.cardEncrypted,
    }),
  });
}

export type VrTransactionStatus = "PENDENTE" | "CONFIRMADA" | "CANCELAMENTO_PENDENTE" | "CANCELADA" | "NEGADA";

export interface ConsultaTransacao {
  id_transacao: string;
  id_transacao_van?: string;
  id_filiacao?: string;
  valor: number;
  data?: string;
  status: VrTransactionStatus;
  mensagem?: string;
}

export async function getTransaction(idTransacaoOuVan: string): Promise<ConsultaTransacao> {
  return await vrFetch<ConsultaTransacao>(`/transacoes/pagamentos/${encodeURIComponent(idTransacaoOuVan)}`);
}

/** Idempotente: consulta antes de estornar; no-op se já CANCELADA/CANCELAMENTO_PENDENTE. */
export async function refund(params: { idTransacao: string; valorCents: number }): Promise<{ noop: boolean }> {
  const consulta = await getTransaction(params.idTransacao);
  if (consulta.status === "CANCELADA" || consulta.status === "CANCELAMENTO_PENDENTE") {
    return { noop: true };
  }
  const idFiliacao = requireEnv("VR_ID_FILIACAO");
  await vrFetch(`/transacoes/pagamentos/${encodeURIComponent(params.idTransacao)}/estornos`, {
    method: "POST",
    body: JSON.stringify({ valor: params.valorCents, id_filiacao: idFiliacao }),
  });
  return { noop: false };
}

// ---------------------------------------------------------------------------
// codigo_retorno → classe / mensagem ao usuário
// ---------------------------------------------------------------------------

export type VrReturnClass =
  | "aprovado"
  | "cartao"
  | "saldo"
  | "limite"
  | "duplicidade"
  | "negado"
  | "erro_ec"
  | "desconhecido";

const CARTAO_MSG = "Cartão inválido, expirado ou dados incorretos. Confira e tente novamente.";
const NEGADO_MSG = "Pagamento não autorizado pela VR.";
const ERRO_EC_MSG = "Não foi possível processar o pagamento agora. Tente novamente em instantes.";

// Tabela única a partir do enum documentado em vr-api-notes.md — sem lógica extra.
const RETURN_CODE_TABLE: Record<string, { classe: VrReturnClass; userMessage: string }> = {
  "00": { classe: "aprovado", userMessage: "Pagamento aprovado." },
  "03": { classe: "cartao", userMessage: CARTAO_MSG },
  "04": { classe: "cartao", userMessage: CARTAO_MSG },
  "63": { classe: "cartao", userMessage: CARTAO_MSG },
  "95": { classe: "cartao", userMessage: CARTAO_MSG },
  "97": { classe: "cartao", userMessage: CARTAO_MSG },
  "02": { classe: "cartao", userMessage: CARTAO_MSG },
  "16": { classe: "saldo", userMessage: "Saldo insuficiente no cartão VR." },
  "60": { classe: "limite", userMessage: "Valor acima do limite permitido para este cartão." },
  "67": { classe: "limite", userMessage: "Valor abaixo do mínimo permitido." },
  D0: { classe: "limite", userMessage: "Valor acima do limite diário permitido." },
  "17": { classe: "duplicidade", userMessage: "Essa transação já foi processada." },
  "76": { classe: "negado", userMessage: NEGADO_MSG },
  C2: { classe: "negado", userMessage: NEGADO_MSG },
  C3: { classe: "negado", userMessage: NEGADO_MSG },
  "11": { classe: "negado", userMessage: NEGADO_MSG },
  "01": { classe: "erro_ec", userMessage: ERRO_EC_MSG },
  "10": { classe: "erro_ec", userMessage: ERRO_EC_MSG },
};

export function classifyReturnCode(codigo: string): { classe: VrReturnClass; userMessage: string } {
  return (
    RETURN_CODE_TABLE[codigo] ?? {
      classe: "desconhecido",
      userMessage: "Não foi possível processar o pagamento. Tente novamente.",
    }
  );
}

// ---------------------------------------------------------------------------
// id_transacao_van
// ---------------------------------------------------------------------------

/** String ≤15 chars, alfanumérica minúscula, sem caracteres especiais. */
export function newIdTransacaoVan(): string {
  const ts = Date.now().toString(36); // ~8 chars hoje
  const rand = Array.from({ length: 6 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
  return `${ts}${rand}`; // 14 chars, dentro do limite de 15
}

// ---------------------------------------------------------------------------
// Criptografia RSA do cartão (espelhado no navegador no ticket 04)
// ---------------------------------------------------------------------------

export type RsaPadding = "oaep-sha256" | "pkcs1";

export interface VrCardInput {
  nome: string;
  numero_cartao: string;
  data_expiracao: string; // AAMM
  cvv: string;
  documento?: string;
}

// Limite de plaintext para RSA-2048 (chave da VR é 2048 bits, ver notes.md).
const OAEP_SHA256_MAX_BYTES = 190;
const PKCS1_MAX_BYTES = 245;

/** Normaliza a chave pública (base64-de-PEM, base64-de-DER ou PEM cru) em DER (WebCrypto) e PEM (node:crypto). */
function normalizePublicKey(publicKeyInput: string): { der: ArrayBuffer; pem: string } {
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
  const der = Uint8Array.from(atob(b64Body), (c) => c.charCodeAt(0)).buffer;
  return { der, pem };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Criptografa os dados do cartão em RSA com a chave pública da VR, retorna base64.
 * Plaintext = JSON.stringify({nome, numero_cartao, data_expiracao, cvv, documento}).
 */
export async function encryptCardData(
  publicKeyInput: string,
  card: VrCardInput,
  padding: RsaPadding,
): Promise<string> {
  const plaintext = JSON.stringify(card);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const maxBytes = padding === "oaep-sha256" ? OAEP_SHA256_MAX_BYTES : PKCS1_MAX_BYTES;
  if (plaintextBytes.byteLength > maxBytes) {
    throw new Error(
      `Dados do cartão excedem o limite de ${maxBytes} bytes para RSA-2048/${padding} ` +
        `(atual: ${plaintextBytes.byteLength} bytes). Reduza o nome do titular.`,
    );
  }

  const { der, pem } = normalizePublicKey(publicKeyInput);

  if (padding === "oaep-sha256") {
    const key = await crypto.subtle.importKey("spki", der, { name: "RSA-OAEP", hash: "SHA-256" }, false, [
      "encrypt",
    ]);
    const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, plaintextBytes);
    return bytesToBase64(new Uint8Array(encrypted));
  }

  const encrypted = nodePublicEncrypt({ key: pem, padding: nodeConstants.RSA_PKCS1_PADDING }, plaintextBytes);
  return bytesToBase64(new Uint8Array(encrypted));
}

// ---------------------------------------------------------------------------
// Só para testes
// ---------------------------------------------------------------------------

/** ponytail: reseta caches de módulo entre testes — nunca chamar em produção. */
export function __resetVrClientCaches(): void {
  tokenCache = null;
  publicKeyCache = null;
  vrEnvLogged = false;
}
