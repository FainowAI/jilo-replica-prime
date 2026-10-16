/**
 * Runner de homologação da VR (Vale Refeição) — comprova as 5 funcionalidades que a
 * VR exige em HML antes de liberar produção: confirmação, cancelamento, reserva de
 * valor, reembolso parcial e tokenização. Usa o MESMO `../_shared/vr-client.ts` do
 * checkout — nada de reimplementar cliente aqui.
 *
 * Uso liberado enquanto o contrato RSA estiver pendente (somente leitura):
 *   deno run --allow-net=api.vr.com.br,api-hmp.vr.com.br --allow-env \
 *     --allow-read=.env.vr-hml --env-file=.env.vr-hml \
 *     supabase/functions/_hml/vr-homologacao.ts --preflight
 *
 * `--preflight`: só testa token + chave pública (sem cartão).
 * Os cenários financeiros via CLI ficam bloqueados até confirmação do fluxo de
 * tokenização inicial ou do contrato RSA, mais autorização específica para HML.
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

/** A massa enviada pela VR usa MM/AA; a API Captura espera AAMM. */
export function normalizeTestCardExpiry(value: string): string {
  const raw = value.trim();
  const mmAa = /^(\d{2})\/(\d{2})$/.exec(raw);
  const aaMm = /^(\d{2})(\d{2})$/.exec(raw);
  const month = mmAa?.[1] ?? aaMm?.[2];
  const year = mmAa?.[2] ?? aaMm?.[1];
  if (!month || !year || Number(month) < 1 || Number(month) > 12) {
    throw new Error("VR_TEST_CARD_VALIDADE deve estar em MM/AA ou AAMM, com mês válido.");
  }
  return `${year}${month}`;
}

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
    validadeAAMM: normalizeTestCardExpiry(requireEnv("VR_TEST_CARD_VALIDADE")),
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
    await getPublicKey();
    return { ok: true, message: "OK token + chave pública completa" };
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
  // O gateway pode ecoar a requisição em campos livres ou até em identificadores.
  const {
    mensagem: _ignored,
    codigo_autorizacao: _authorization,
    cartao_token_id_masked: _token,
    ultimos4_digitos: _lastFour,
    status_cartao: _cardStatus,
    ...safeExtra
  } = extra;
  const safeId = (value: string | undefined, max: number) =>
    value === undefined || (value.length <= max && /^[A-Za-z0-9_-]+$/.test(value));
  if (
    !safeId(safeExtra.id_transacao, 64) ||
    !safeId(safeExtra.id_transacao_van, 15) ||
    (safeExtra.codigo_retorno !== undefined && !/^\d{2}$/.test(safeExtra.codigo_retorno)) ||
    (safeExtra.status !== undefined && !/^[A-Z_]{2,30}$/.test(safeExtra.status)) ||
    (safeExtra.valor !== undefined && (!Number.isSafeInteger(safeExtra.valor) || safeExtra.valor <= 0))
  ) {
    throw new Error("Resposta VR contém campo inválido para evidência.");
  }
  const strings = [safeExtra.id_transacao, safeExtra.id_transacao_van, safeExtra.codigo_retorno, safeExtra.status]
    .filter((value): value is string => typeof value === "string");
  const secrets = ["VR_TEST_CARD_NUMERO", "VR_TEST_CARD_NOME", "VR_TEST_CARD_CVV", "VR_TEST_CARD_DOCUMENTO"]
    .map((name) => Deno.env.get(name)).filter((value): value is string => !!value);
  if (secrets.some((secret) => strings.some((value) => value.includes(secret)))) {
    throw new Error("Resposta VR contém dado do cartão em campo de evidência.");
  }
  return { cenario, passo, timestamp: nowIso(), ok: true, ...safeExtra };
}

function evidenciaErr(cenario: string, passo: string, err: unknown): Evidencia {
  const erro = err instanceof VrApiError
    ? { code: err.code, status: err.status }
    : { code: "unknown", status: undefined };
  return { cenario, passo, timestamp: nowIso(), ok: false, erro };
}

/** Roda um passo; qualquer falha interrompe a suíte até a reconciliação do cenário. */
async function step(
  cenario: string,
  passo: string,
  evidencias: Evidencia[],
  fn: () => Promise<Partial<Evidencia>>,
): Promise<boolean> {
  try {
    const extra = await fn();
    if (extra.codigo_retorno && extra.codigo_retorno !== "00") {
      throw new Error(`VR recusou ${passo} (codigo_retorno=${extra.codigo_retorno}).`);
    }
    evidencias.push(evidenciaOk(cenario, passo, extra));
    return true;
  } catch (err) {
    evidencias.push(evidenciaErr(cenario, passo, err));
    // Uma consulta falha também deixa a escrita anterior sem confirmação.
    throw new Error(`Passo ${passo} sem conclusão comprovada; interromper e reconciliar antes de continuar.`);
  }
}

// ---------------------------------------------------------------------------
// O contrato RSA (padding e plaintext) ainda depende de resposta oficial da VR.
// Nos testes sintéticos o padding é explícito; nunca repetir uma transação para "descobri-lo".
// ---------------------------------------------------------------------------

interface PaddingState {
  padding: RsaPadding;
}

async function withConfirmedPadding<T extends { codigo_retorno: string }>(
  state: PaddingState,
  create: (args: { valorCents: number; idTransacaoVan: string; keyId: string; cardEncrypted: string }) => Promise<T>,
  args: { keyId: string; publicKey: string; card: VrCardInput; valorCents: number },
): Promise<{ result: T; padding: RsaPadding; idTransacaoVan: string }> {
  const idTransacaoVan = newIdTransacaoVan();
  const cardEncrypted = await encryptCardData(args.publicKey, args.card, state.padding);
  const result = await create({
    valorCents: args.valorCents,
    idTransacaoVan,
    keyId: args.keyId,
    cardEncrypted,
  });
  return { result, padding: state.padding, idTransacaoVan };
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
  if (!t.id_transacao || t.codigo_retorno !== "00" || !Number.isSafeInteger(t.valor) || t.valor <= 0) {
    throw new Error("Resposta VR não comprova transação aprovada com valor válido.");
  }
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

function assertStatusAndValue(actual: { status: string; valor: number }, expectedStatus: string, expectedValue: number): void {
  if (actual.status !== expectedStatus || actual.valor !== expectedValue) {
    throw new Error(`Consulta VR não confirmou ${expectedStatus} e valor ${expectedValue}.`);
  }
}

async function scenarioConfirmacao(ctx: Ctx): Promise<void> {
  const cenario = "confirmacao";
  let idTransacaoVan: string;
  const created = await step(cenario, "createPayment", ctx.evidencias, async () => {
    const { result, padding, idTransacaoVan: van } = await withConfirmedPadding(ctx.state, createPayment, ctx);
    idTransacaoVan = van;
    return transacaoExtra(result, van, padding);
  });
  if (!created) return;
  await step(cenario, "getTransaction", ctx.evidencias, async () => {
    const consulta = await getTransaction(idTransacaoVan);
    assertStatusAndValue(consulta, "CONFIRMADA", ctx.valorCents);
    return { id_transacao: consulta.id_transacao, id_transacao_van: idTransacaoVan, valor: consulta.valor, status: consulta.status, mensagem: consulta.mensagem };
  });
}

async function scenarioCancelamentoEstornoTotal(ctx: Ctx): Promise<void> {
  const cenario = "cancelamento_estorno_total";
  let idTransacao: string;
  let idTransacaoVan: string;
  const created = await step(cenario, "createPayment", ctx.evidencias, async () => {
    const { result, padding, idTransacaoVan: van } = await withConfirmedPadding(ctx.state, createPayment, ctx);
    idTransacao = result.id_transacao;
    idTransacaoVan = van;
    return transacaoExtra(result, van, padding);
  });
  if (!created) return;
  const refunded = await step(cenario, "refund", ctx.evidencias, async () => {
    const { estorno } = await refund({ idTransacao, valorCents: ctx.valorCents });
    if (!estorno) throw new Error("Estorno integral não executado.");
    if (estorno.valor !== ctx.valorCents) throw new Error("Valor do estorno integral divergente.");
    return transacaoExtra(estorno, idTransacaoVan);
  });
  if (!refunded) return;
  await step(cenario, "getTransaction", ctx.evidencias, async () => {
    const consulta = await getTransaction(idTransacaoVan);
    assertStatusAndValue(consulta, "CANCELADA", ctx.valorCents);
    return { id_transacao: consulta.id_transacao, id_transacao_van: idTransacaoVan, valor: consulta.valor, status: consulta.status, mensagem: consulta.mensagem };
  });
}

async function scenarioReservaEfetivacao(ctx: Ctx): Promise<void> {
  const cenario = "reserva_efetivacao";
  let idTransacao: string;
  let idTransacaoVan: string;
  const created = await step(cenario, "createReservation", ctx.evidencias, async () => {
    const { result, padding, idTransacaoVan: van } = await withConfirmedPadding(ctx.state, createReservation, ctx);
    idTransacao = result.id_transacao;
    idTransacaoVan = van;
    return transacaoExtra(result, van, padding);
  });
  if (!created) return;
  const consulted = await step(cenario, "getReservation", ctx.evidencias, async () => {
    const reserva = await getReservation(idTransacao);
    assertStatusAndValue(reserva, "PENDENTE", ctx.valorCents);
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
    assertStatusAndValue(consulta, "CONFIRMADA", ctx.valorCents);
    return { id_transacao: consulta.id_transacao, id_transacao_van: idTransacaoVan, valor: consulta.valor, status: consulta.status, mensagem: consulta.mensagem };
  });
}

async function scenarioReservaCancelamento(ctx: Ctx): Promise<void> {
  const cenario = "reserva_cancelamento";
  let idTransacao: string;
  let idTransacaoVan: string;
  const created = await step(cenario, "createReservation", ctx.evidencias, async () => {
    const { result, padding, idTransacaoVan: van } = await withConfirmedPadding(ctx.state, createReservation, ctx);
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
    assertStatusAndValue(reserva, "CANCELADA", ctx.valorCents);
    return { id_transacao: reserva.id_transacao, valor: reserva.valor, status: reserva.status, mensagem: reserva.mensagem };
  });
}

async function scenarioReembolsoParcial(ctx: Ctx): Promise<void> {
  const cenario = "reembolso_parcial";
  let idTransacao: string;
  let idTransacaoVan: string;
  const created = await step(cenario, "createPayment", ctx.evidencias, async () => {
    const { result, padding, idTransacaoVan: van } = await withConfirmedPadding(ctx.state, createPayment, ctx);
    idTransacao = result.id_transacao;
    idTransacaoVan = van;
    return transacaoExtra(result, van, padding);
  });
  if (!created) return;
  const parcialCents = Math.round(ctx.valorCents * 0.4);
  const refunded = await step(cenario, "refund(parcial 40%)", ctx.evidencias, async () => {
    const { estorno } = await refund({ idTransacao, valorCents: parcialCents });
    if (!estorno) throw new Error("Estorno parcial não executado.");
    if (estorno.valor !== parcialCents) throw new Error("Valor do estorno parcial divergente.");
    return transacaoExtra(estorno, idTransacaoVan);
  });
  if (!refunded) return;
  await step(cenario, "getTransaction", ctx.evidencias, async () => {
    const consulta = await getTransaction(idTransacaoVan);
    assertStatusAndValue(consulta, "CONFIRMADA", ctx.valorCents);
    return { id_transacao: consulta.id_transacao, id_transacao_van: idTransacaoVan, valor: consulta.valor, status: consulta.status, mensagem: consulta.mensagem };
  });
}

async function scenarioTokenizacao(ctx: Ctx, testCard: TestCardEnv): Promise<void> {
  const cenario = "tokenizacao";
  const mes = Number(testCard.validadeAAMM.slice(2, 4));
  const ano = 2000 + Number(testCard.validadeAAMM.slice(0, 2));
  let cartaoTokenId: string | undefined;
  let paymentStarted = false;
  let paymentVerified = false;

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
      paymentStarted = true;
      const result = await createPayment({ valorCents: ctx.valorCents, idTransacaoVan: van, cartaoTokenId: cartaoTokenId! });
      return transacaoExtra(result, van);
    });
    if (!paid || !idTransacaoVan) return;

    await step(cenario, "getTransaction", ctx.evidencias, async () => {
      const consulta = await getTransaction(idTransacaoVan!);
      assertStatusAndValue(consulta, "CONFIRMADA", ctx.valorCents);
      return { id_transacao: consulta.id_transacao, id_transacao_van: idTransacaoVan, valor: consulta.valor, status: consulta.status, mensagem: consulta.mensagem };
    });
    paymentVerified = true;
  } finally {
    // Se o pagamento não foi confirmado, manter o token para reconciliação controlada.
    if (cartaoTokenId && (!paymentStarted || paymentVerified)) {
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
    "# Evidências de Homologação VR - API de Captura v2 (versão 2.4.0/2.4.1 a confirmar)",
    "",
    `- Ambiente: Homologação (VR_ENV=hml)`,
    `- id_filiacao: ${header.idFiliacao}`,
    `- client_id: ${header.clientIdMasked}`,
    `- Padding RSA exercitado apenas em teste sintético: ${header.padding ?? "não determinado"}; aceitação pela VR não comprovada`,
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

export async function runHomologacao(opts: { out?: string; testOnlyRsaPadding?: RsaPadding } = {}): Promise<Evidencia[]> {
  assertHmlEnv();
  // Bloqueio deliberado: a VR recomendou token, mas o contrato da tokenização
  // inicial e o escopo de dados do cartão ainda não foram confirmados.
  // Apenas testes com fetch stubado passam padding explícito.
  if (import.meta.main || !opts.testOnlyRsaPadding) {
    throw new Error("Cenários HML bloqueados: confirmar tokenização inicial e escopo, ou contrato RSA, antes de transações. Use --preflight para consulta sem cartão.");
  }
  const testCard = requireTestCardEnv();
  const valorCents = valorCentsFromEnv();
  if (!Number.isSafeInteger(valorCents) || valorCents < 3) {
    throw new Error("VR_TEST_VALOR_CENTS deve ser um inteiro de pelo menos 3 centavos para o teste parcial.");
  }
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

  const state: PaddingState = { padding: opts.testOnlyRsaPadding };
  const evidencias: Evidencia[] = [];
  const ctx: Ctx = { state, keyId: key_id, publicKey: public_key, card, valorCents, evidencias };

  const out = opts.out ?? ".claude/.work/pagamento-vr";
  let runError: unknown;
  try {
    await scenarioConfirmacao(ctx);
    await scenarioCancelamentoEstornoTotal(ctx);
    await scenarioReservaEfetivacao(ctx);
    await scenarioReservaCancelamento(ctx);
    await scenarioReembolsoParcial(ctx);
    await scenarioTokenizacao(ctx, testCard);
  } catch (err) {
    runError = err;
  }
  try {
    await writeEvidenceFiles(out, evidencias, { idFiliacao, clientIdMasked, padding: state.padding });
  } catch (writeError) {
    if (runError) {
      throw new AggregateError([runError, writeError], "Homologação e gravação de evidência falharam.");
    }
    throw writeError;
  }
  if (runError) throw runError;

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
