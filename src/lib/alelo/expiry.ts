// Validade do cartão: o SOP da Cielo exige "MM/AAAA" no input bp-sop-cardexpirationdate, mas o teclado
// numérico do celular não tem "/". Por isso a UI coleta mês e ano separados e monta o valor aqui.

/** Devolve "MM/AAAA" ou null se mês/ano forem inválidos ou o cartão estiver vencido. */
export function composeExpiry(mes: string, ano: string, hoje: Date = new Date()): string | null {
  if (!/^\d{1,2}$/.test(mes) || !/^(\d{2}|\d{4})$/.test(ano)) return null;
  const m = Number(mes);
  if (m < 1 || m > 12) return null;
  const y = ano.length === 2 ? 2000 + Number(ano) : Number(ano);
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  if (y < anoAtual || (y === anoAtual && m < mesAtual)) return null;
  return `${String(m).padStart(2, "0")}/${y}`;
}
