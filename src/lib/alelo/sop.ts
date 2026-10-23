// Regras do script silentorderpost-1.0.min.js (lido em 22/10/2026). Ele valida no navegador, antes de
// enviar o cartão, e chama onInvalid se: o nome não casar com /^[a-zA-Z ]{1,64}$/ (sem acento), o número
// tiver algo além de dígitos ou falhar no Luhn, a validade não for "MM/AAAA", ou o CVV — lido de
// `.bp-sop-cardcvv` — não tiver 3 ou 4 dígitos.

/**
 * Classes que o script lê. O CVV é `cardcvv`: a tabela da doc Cielo (integrando-com-o-sop) diz `cardcvvc`,
 * mas o script não acha esse campo e recusa todo cartão — foi o que derrubou as tentativas de 13 a 15/10.
 */
export const SOP_CLASS = {
  holder: "bp-sop-cardholdername",
  number: "bp-sop-cardnumber",
  expiry: "bp-sop-cardexpirationdate",
  cvv: "bp-sop-cardcvv",
  cardType: "bp-sop-cardtype",
} as const;

/** Nome no formato aceito pelo SOP: sem acento, só letras e espaço, até 64. "Antônio d'Ávila" → "ANTONIO D AVILA". */
export function sopHolderName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 64);
}

export interface SopInvalidField {
  Field?: string;
}

/** Mensagem do onInvalid pelo primeiro campo recusado (o array do SOP só traz nome do campo e texto fixo). */
export function sopInvalidMessage(fields: SopInvalidField[] | undefined): string {
  const field = fields?.[0]?.Field ?? "";
  if (field === SOP_CLASS.holder) return "Confira o nome no cartão (só letras, sem acento).";
  if (field === SOP_CLASS.number) return "Confira o número do cartão.";
  if (field === SOP_CLASS.expiry) return "Confira a validade do cartão (mês e ano).";
  if (field === SOP_CLASS.cvv) return "Confira o CVV (3 ou 4 números no verso do cartão).";
  return `Confira os dados do cartão.${field ? ` (${field})` : ""}`;
}
