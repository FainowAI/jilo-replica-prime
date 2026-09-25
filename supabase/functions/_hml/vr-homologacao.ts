/**
 * Runner de homologação da VR (Vale Refeição) — comprova as 5 funcionalidades que a
 * VR exige em HML antes de liberar produção: confirmação, cancelamento, reserva de
 * valor, reembolso parcial e tokenização. Usa o MESMO `../_shared/vr-client.ts` do
 * checkout — nada de reimplementar cliente aqui.
 *
 * Uso:
 *   npx -y deno run --allow-net --allow-env --allow-read --allow-write \
 *     --env-file=.env.vr-hml supabase/functions/_hml/vr-homologacao.ts [--preflight] [--out <dir>]
 *
 * `--preflight`: só testa token + chave pública (sem cartão) — rodar assim que a
 * App da VR sair de "Pendente" no gateway, antes de gastar as transações de teste.
 *
 * `--out <dir>`: pasta de saída das evidências (default `.claude/.work/pagamento-vr`,
 * relativo ao cwd = raiz do repo; já coberta pelo `.gitignore`).
 *
 * Nunca logar/gravar: PAN, CVV, nome, documento, validade, blob cifrado, access_token,
 * client_secret. `client_id` só mascarado.
 */
import {
  createPayment,
  createReservation,
  deleteTokenizedCard,
  encryptCardData,
  getPublicKey,
  getReservation,
  getTokenizedCard,
  getTransaction,
  getVrAccessToken,
  newIdTransacaoVan,
  refund,
  settleReservation,
  tokenizeCard,
  VrApiError,
  type RsaPadding,
  type TransacaoAutorizada,
  type TransacaoReserva,
  type VrCardInput,
} from "../_shared/vr-client.ts";

// ---------------------------------------------------------------------------
// Env / guardas
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Env var ${name} não configurada.`);
  return value;
}

/** Recusa prod/mock — homologação só roda contra VR_ENV=hml. */
function assertHmlEnv(): void {
  const env = Deno.env.get("VR_ENV");
  if (env !== "hml") {
    throw new Error(`Homologação exige VR_ENV=hml (atual: "${env ?? ""}"). Recusando para não arriscar prod/mock.`);
  }
}

interface TestCardEnv {
  numero: string;
  nome: string;
  validadeAAMM: string;
  cvv: string;
  documento?: string;
}

const TEST_CARD_ENV_VARS = ["VR_TEST_CARD_NUMERO", "VR_TEST_CARD_NOME", "VR_TEST_CARD_VALIDADE", "VR_TEST_CARD_CVV"];

function requireTestCardEnv(): TestCardEnv {
  const missing = TEST_CARD_ENV_VARS.filter((n) => !Deno.env.get(n));
  if (missing.length > 0) {
    throw new Error(
      `Faltam variáveis do cartão de teste da VR: ${missing.join(", ")} ` +
        `(opcional: VR_TEST_CARD_DOCUMENTO; default: VR_TEST_VALOR_CENTS=1000).`,
    );
  }
  return {
    numero: requireEnv("VR_TEST_CARD_NUMERO"),
    nome: requireEnv("VR_TEST_CARD_NOME"),
    validadeAAMM: requireEnv("VR_TEST_CARD_VALIDADE"),
    cvv: requireEnv("VR_TEST_CARD_CVV"),
    documento: Deno.env.get("VR_TEST_CARD_DOCUMENTO") ?? undefined,
  };
}

function valorCentsFromEnv(): number {
  const raw = Deno.env.get("VR_TEST_VALOR_CENTS");
  return raw ? Number(raw) : 1000;
}

function maskClientId(id: string): string {
  if (id.length <= 4) return "****";
  return `${id.slice(0, 2)}***${id.slice(-2)}`;
}

function maskTokenId(id: string): string {
  return id.length > 4 ? `****${id.slice(-4)}` : "****";
}

// ---------------------------------------------------------------------------
// Preflight — readiness check sem cartão
// ---------------------------------------------------------------------------

export async function runPreflight(): Promise<{ ok: boolean; message: string }> {
  assertHmlEnv();
  try {
    await getVrAccessToken();
    const { key_id } = await getPublicKey();
    return { ok: true, message: `OK token + chave pública (key_id=${key_id})` };
  } catch (err) {
    if (err instanceof VrApiError) {
      return { ok: false, message: `Falhou: ${err.code}${err.status ? ` status=${err.status}` : ""}` };
    }
    return { ok: false, message: `Falhou: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Evidências
// ---------------------------------------------------------------------------

export interface Evidencia {
  cenario: string;
  passo: string;
  timestamp: string;
  ok: boolean;
  erro?: { code: string; status?: number };
  id_transacao?: string;
  id_transacao_van?: string;
  valor?: number;
  codigo_retorno?: string;
  codigo_autorizacao?: string;
  status?: string;
  mensagem?: string;
  padding?: RsaPadding;
  cartao_token_id_masked?: string;
  ultimos4_digitos?: string;
  status_cartao?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function evidenciaOk(cenario: string, passo: string, extra: Partial<Evidencia> = {}): Evidencia {
  return { cenario, passo, timestamp: nowIso(), ok: true, ...extra };
}

function evidenciaErr(cenario: string, passo: string, err: unknown): Evidencia {
  const erro = err instanceof VrApiError
    ? { code: err.code, status: err.status }
    : { code: "unknown", status: undefined };
  return { cenario, passo, timestamp: nowIso(), ok: false, erro };
}

/** Roda um passo do cenário; em erro, registra a evidência e sinaliza para pular os passos seguintes do cenário. */
async function step(
  cenario: string,
  passo: string,
  evidencias: Evidencia[],
  fn: () => Promise<Partial<Evidencia>>,
): Promise<boolean> {
  try {
    const extra = await fn();
    evidencias.push(evidenciaOk(cenario, passo, extra));
    return true;
  } catch (err) {
    evidencias.push(evidenciaErr(cenario, passo, err));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Padding RSA indocumentado: tenta oaep-sha256, cai pra pkcs1 em falha de cartão,
// e fixa o padding aceito para o resto da run (via `state`, compartilhado entre cenários).
// ---------------------------------------------------------------------------

interface PaddingState {
  padding: RsaPadding | null;
}

const CARD_ERROR_CODES = ["63", "99", "76"];

async function withPaddingFallback<T extends { codigo_retorno: string }>(
  state: PaddingState,
  create: (args: { valorCents: number; idTransacaoVan: string; keyId: string; cardEncrypted: string }) => Promise<T>,
  args: { keyId: string; publicKey: string; card: VrCardInput; valorCents: number },
): Promise<{ result: T; padding: RsaPadding; idTransacaoVan: string }> {
  const padding1: RsaPadding = state.padding ?? "oaep-sha256";
  const idTransacaoVan1 = newIdTransacaoVan();
  const cardEncrypted1 = await encryptCardData(args.publicKey, args.card, padding1);

  const attemptFallback = async () => {
    const padding2: RsaPadding = padding1 === "oaep-sha256" ? "pkcs1" : "oaep-sha256";
    const idTransacaoVan2 = newIdTransacaoVan();
    const cardEncrypted2 = await encryptCardData(args.publicKey, args.card, padding2);
    const result2 = await create({
      valorCents: args.valorCents,
      idTransacaoVan: idTransacaoVan2,
      keyId: args.keyId,
      cardEncrypted: cardEncrypted2,
    });
    state.padding = padding2;
    return { result: result2, padding: padding2, idTransacaoVan: idTransacaoVan2 };
  };

  try {
    const result = await create({
      valorCents: args.valorCents,
      idTransacaoVan: idTransacaoVan1,
      keyId: args.keyId,
      cardEncrypted: cardEncrypted1,
    });
    const cardCodeBad = result.codigo_retorno !== "00" && CARD_ERROR_CODES.includes(result.codigo_retorno);
    if (state.padding === null && cardCodeBad) {
      return await attemptFallback();
    }
    state.padding = padding1;
    return { result, padding: padding1, idTransacaoVan: idTransacaoVan1 };
  } catch (err) {
    const shouldFallback = state.padding === null && err instanceof VrApiError && err.status === 400;
    if (!shouldFallback) throw err;
    return await attemptFallback();
  }
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

interface Ctx {
  state: PaddingState;
  keyId: string;
  publicKey: string;
  card: VrCardInput;
  valorCents: number;
  evidencias: Evidencia[];
}

function transacaoExtra(t: TransacaoAutorizada | TransacaoReserva, idTransacaoVan: string, padding?: RsaPadding): Partial<Evidencia> {
  return {
    id_transacao: t.id_transacao,
    id_transacao_van: idTransacaoVan,
    valor: t.valor,
    codigo_retorno: t.codigo_retorno,
    codigo_autorizacao: t.codigo_autorizacao,
    mensagem: t.mensagem,
    ...(padding ? { padding } : {}),
  };
}

async function scenarioConfirmacao(ctx: Ctx): Promise<void> {
  const cenario = "confirmacao";
  let idTransacaoVan: string;
  const created = await step(cenario, "createPayment", ctx.evidencias, async () => {
    const { result, padding, idTransacaoVan: van } = await withPaddingFallback(ctx.state, createPayment, ctx);
    idTransacaoVan = van;
    return transacaoExtra(result, van, padding);
  });
  if (!created) return;
  await step(cenario, "getTransaction", ctx.evidencias, async () => {
    const consulta = await getTransaction(idTransacaoVan);
    return { id_transacao: consulta.id_transacao, id_transacao_van: idTransacaoVan, valor: consulta.valor, status: consulta.status, mensagem: consulta.mensagem };
  });
}

async function scenarioCancelamentoEstornoTotal(ctx: Ctx): Promise<void> {
  const cenario = "cancelamento_estorno_total";
  let idTransacao: string;
  let idTransacaoVan: string;
  const created = await step(cenario, "createPayment", ctx.evidencias, async () => {
    const { result, padding, idTransacaoVan: van } = await withPaddingFallback(ctx.state, createPayment, ctx);
    idTransacao = result.id_transacao;
    idTransacaoVan = van;
    return transacaoExtra(result, van, padding);
  });
  if (!created) return;
  const refunded = await step(cenario, "refund", ctx.evidencias, async () => {
    const { estorno } = await refund({ idTransacao, valorCents: ctx.valorCents });
    return estorno ? transacaoExtra(estorno, idTransacaoVan) : {};
  });
  if (!refunded) return;
  await step(cenario, "getTransaction", ctx.evidencias, async () => {
    const consulta = await getTransaction(idTransacaoVan);
    return { id_transacao: consulta.id_transacao, id_transacao_van: idTransacaoVan, valor: consulta.valor, status: consulta.status, mensagem: consulta.mensagem };
  });
}

async function scenarioReservaEfetivacao(ctx: Ctx): Promise<void> {
  const cenario = "reserva_efetivacao";
  let idTransacao: string;
  let idTransacaoVan: string;
  const created = await step(cenario, "createReservation", ctx.evidencias, async () => {
    const { result, padding, idTransacaoVan: van } = await withPaddingFallback(ctx.state, createReservation, ctx);
    idTransacao = result.id_transacao;
    idTransacaoVan = van;
    return transacaoExtra(result, van, padding);
  });
  if (!created) return;
  const consulted = await step(cenario, "getReservation", ctx.evidencias, async () => {
    const reserva = await getReservation(idTransacao);
    return { id_transacao: reserva.id_transacao, valor: reserva.valor, status: reserva.status, mensagem: reserva.mensagem };
  });
  if (!consulted) return;
  const settled = await step(cenario, "settleReservation(efetivar)", ctx.evidencias, async () => {
    const settled = await settleReservation({ idTransacao, acao: "efetivar", valorCents: ctx.valorCents });
    return transacaoExtra(settled, idTransacaoVan);
  });
  if (!settled) return;
  await step(cenario, "getTransaction", ctx.evidencias, async () => {
    const consulta = await getTransaction(idTransacaoVan);
    return { id_transacao: consulta.id_transacao, id_transacao_van: idTransacaoVan, valor: consulta.valor, status: consulta.status, mensagem: consulta.mensagem };
  });
}

async function scenarioReservaCancelamento(ctx: Ctx): Promise<void> {
  const cenario = "reserva_cancelamento";
  let idTransacao: string;
  let idTransacaoVan: string;
  const created = await step(cenario, "createReservation", ctx.evidencias, async () => {
    const { result, padding, idTransacaoVan: van } = await withPaddingFallback(ctx.state, createReservation, ctx);
    idTransacao = result.id_transacao;
    idTransacaoVan = van;
    return transacaoExtra(result, van, padding);
  });
  if (!created) return;
  // `valor` é obrigatório em EfetivaReserva — reenviamos o valor total reservado ao cancelar.
  const settled = await step(cenario, "settleReservation(cancelar)", ctx.evidencias, async () => {
    const settled = await settleReservation({ idTransacao, acao: "cancelar", valorCents: ctx.valorCents });
    return transacaoExtra(settled, idTransacaoVan);
  });
  if (!settled) return;
  await step(cenario, "getReservation", ctx.evidencias, async () => {
    const reserva = await getReservation(idTransacao);
    return { id_transacao: reserva.id_transacao, valor: reserva.valor, status: reserva.status, mensagem: reserva.mensagem };
  });
}

async function scenarioReembolsoParcial(ctx: Ctx): Promise<void> {
  const cenario = "reembolso_parcial";
  let idTransacao: string;
  let idTransacaoVan: string;
  const created = await step(cenario, "createPayment", ctx.evidencias, async () => {
    const { result, padding, idTransacaoVan: van } = await withPaddingFallback(ctx.state, createPayment, ctx);
    idTransacao = result.id_transacao;
    idTransacaoVan = van;
    return transacaoExtra(result, van, padding);
  });
  if (!created) return;
  const parcialCents = Math.round(ctx.valorCents * 0.4);
  const refunded = await step(cenario, "refund(parcial 40%)", ctx.evidencias, async () => {
    const { estorno } = await refund({ idTransacao, valorCents: parcialCents });
    return estorno ? transacaoExtra(estorno, idTransacaoVan) : {};
  });
  if (!refunded) return;
  await step(cenario, "getTransaction", ctx.evidencias, async () => {
    const consulta = await getTransaction(idTransacaoVan);
    return { id_transacao: consulta.id_transacao, id_transacao_van: idTransacaoVan, valor: consulta.valor, status: consulta.status, mensagem: consulta.mensagem };
  });
}

async function scenarioTokenizacao(ctx: Ctx, testCard: TestCardEnv): Promise<void> {
  const cenario = "tokenizacao";
  const mes = Number(testCard.validadeAAMM.slice(2, 4));
  const ano = 2000 + Number(testCard.validadeAAMM.slice(0, 2));
  let cartaoTokenId: string | undefined;

  try {
    const tokenized = await step(cenario, "tokenizeCard", ctx.evidencias, async () => {
      const result = await tokenizeCard({
        numero_cartao: testCard.numero,
        nome_impressao: testCard.nome,
        cvv: testCard.cvv,
        mes_validade: mes,
        ano_validade: ano,
      });
      cartaoTokenId = result.cartao_token_id;
      return { cartao_token_id_masked: maskTokenId(result.cartao_token_id) };
    });
    if (!tokenized || !cartaoTokenId) return;

    const consulted = await step(cenario, "getTokenizedCard", ctx.evidencias, async () => {
      const consulta = await getTokenizedCard(cartaoTokenId!);
      return {
        cartao_token_id_masked: maskTokenId(consulta.cartao.cartao_token_id),
        ultimos4_digitos: consulta.cartao.ultimos4_digitos,
        status_cartao: consulta.cartao.status_cartao,
      };
    });
    if (!consulted) return;

    let idTransacaoVan: string | undefined;
    const paid = await step(cenario, "createPayment(cartaoTokenId)", ctx.evidencias, async () => {
      const van = newIdTransacaoVan();
      idTransacaoVan = van;
      const result = await createPayment({ valorCents: ctx.valorCents, idTransacaoVan: van, cartaoTokenId: cartaoTokenId! });
      return transacaoExtra(result, van);
    });
    if (!paid || !idTransacaoVan) return;

    await step(cenario, "getTransaction", ctx.evidencias, async () => {
      const consulta = await getTransaction(idTransacaoVan!);
      return { id_transacao: consulta.id_transacao, id_transacao_van: idTransacaoVan, valor: consulta.valor, status: consulta.status, mensagem: consulta.mensagem };
    });
  } finally {
    if (cartaoTokenId) {
      await step(cenario, "deleteTokenizedCard", ctx.evidencias, async () => {
        await deleteTokenizedCard(cartaoTokenId!);
        return {};
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Saída: tabela + arquivos .md/.json
// ---------------------------------------------------------------------------

function printTable(evidencias: Evidencia[]): void {
  console.table(
    evidencias.map((e) => ({
      cenario: e.cenario,
      passo: e.passo,
      ok: e.ok,
      status: e.status ?? "",
      codigo_retorno: e.codigo_retorno ?? "",
      erro: e.erro ? `${e.erro.code}${e.erro.status ? ` (${e.erro.status})` : ""}` : "",
    })),
  );
}

function timestampForFilename(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function evidenceRow(e: Evidencia): string {
  if (!e.ok) {
    return `| ${e.passo} | erro | ${e.erro?.code ?? ""} ${e.erro?.status ?? ""} | - | - | ${e.timestamp} |`;
  }
  const detalhe = e.cartao_token_id_masked
    ? `token=${e.cartao_token_id_masked} ultimos4=${e.ultimos4_digitos ?? ""} status=${e.status_cartao ?? ""}`
    : `id=${e.id_transacao ?? ""} van=${e.id_transacao_van ?? ""} valor=${e.valor ?? ""}`;
  return `| ${e.passo} | ok | ${e.codigo_retorno ?? ""} | ${e.status ?? ""} | ${detalhe}${e.padding ? ` padding=${e.padding}` : ""} | ${e.timestamp} |`;
}

function buildMarkdown(
  evidencias: Evidencia[],
  header: { idFiliacao: string; clientIdMasked: string; padding: RsaPadding | null },
): string {
  const cenarios = [...new Set(evidencias.map((e) => e.cenario))];
  const lines: string[] = [
    "# Evidências de Homologação VR — API de Captura 2.4.0",
    "",
    `- Ambiente: Homologação (VR_ENV=hml)`,
    `- id_filiacao: ${header.idFiliacao}`,
    `- client_id: ${header.clientIdMasked}`,
    `- Padding RSA aceito: ${header.padding ?? "não determinado (todos os cenários com cartão cifrado falharam)"}`,
    "",
  ];
  for (const cenario of cenarios) {
    lines.push(`## ${cenario}`, "", "| passo | ok | codigo_retorno/erro | status | detalhe | timestamp |", "|---|---|---|---|---|---|");
    for (const e of evidencias.filter((x) => x.cenario === cenario)) {
      lines.push(evidenceRow(e));
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function writeEvidenceFiles(
  out: string,
  evidencias: Evidencia[],
  header: { idFiliacao: string; clientIdMasked: string; padding: RsaPadding | null },
): Promise<{ mdPath: string; jsonPath: string }> {
  await Deno.mkdir(out, { recursive: true });
  const ts = timestampForFilename(new Date());
  const mdPath = `${out}/evidencias-hml-${ts}.md`;
  const jsonPath = `${out}/evidencias-hml-${ts}.json`;
  await Deno.writeTextFile(mdPath, buildMarkdown(evidencias, header));
  await Deno.writeTextFile(jsonPath, JSON.stringify({ ...header, evidencias }, null, 2));
  return { mdPath, jsonPath };
}

// ---------------------------------------------------------------------------
// Entrypoint da homologação completa
// ---------------------------------------------------------------------------

export async function runHomologacao(opts: { out?: string } = {}): Promise<Evidencia[]> {
  assertHmlEnv();
  const testCard = requireTestCardEnv();
  const valorCents = valorCentsFromEnv();
  const idFiliacao = requireEnv("VR_ID_FILIACAO");
  const clientIdMasked = maskClientId(requireEnv("VR_CLIENT_ID"));

  const { key_id, public_key } = await getPublicKey();
  const card: VrCardInput = {
    nome: testCard.nome,
    numero_cartao: testCard.numero,
    data_expiracao: testCard.validadeAAMM,
    cvv: testCard.cvv,
    documento: testCard.documento,
  };

  const state: PaddingState = { padding: null };
  const evidencias: Evidencia[] = [];
  const ctx: Ctx = { state, keyId: key_id, publicKey: public_key, card, valorCents, evidencias };

  await scenarioConfirmacao(ctx);
  await scenarioCancelamentoEstornoTotal(ctx);
  await scenarioReservaEfetivacao(ctx);
  await scenarioReservaCancelamento(ctx);
  await scenarioReembolsoParcial(ctx);
  await scenarioTokenizacao(ctx, testCard);

  const out = opts.out ?? ".claude/.work/pagamento-vr";
  await writeEvidenceFiles(out, evidencias, { idFiliacao, clientIdMasked, padding: state.padding });

  return evidencias;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = Deno.args;
  const preflight = args.includes("--preflight");
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : undefined;

  try {
    if (preflight) {
      const result = await runPreflight();
      console.log(result.message);
      Deno.exit(result.ok ? 0 : 1);
    }
    const evidencias = await runHomologacao({ out });
    printTable(evidencias);
    const failed = evidencias.some((e) => !e.ok);
    if (failed) {
      console.error("[vr-homologacao] um ou mais cenários falharam — ver tabela e arquivos de evidência.");
    }
    Deno.exit(failed ? 1 : 0);
  } catch (err) {
    console.error(`[vr-homologacao] ${err instanceof Error ? err.message : String(err)}`);
    Deno.exit(1);
  }
}
