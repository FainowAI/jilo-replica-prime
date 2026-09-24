/**
 * Utilitários puros para o formulário de cartão VR — sem dependências, sem React.
 * Contrato: `.claude/.work/pagamento-vr/plan-04.md`.
 */

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Algoritmo de Luhn para cartão de 16 dígitos. */
export function luhnValid(digits: string): boolean {
  if (!/^\d{16}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Aceita CPF com ou sem máscara; rejeita sequências repetidas; valida dígitos verificadores. */
export function isValidCpf(cpf: string): boolean {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcCheckDigit = (base: string): number => {
    let sum = 0;
    let weight = base.length + 1;
    for (const c of base) {
      sum += Number(c) * weight;
      weight--;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const d1 = calcCheckDigit(digits.slice(0, 9));
  const d2 = calcCheckDigit(digits.slice(0, 10));
  return d1 === Number(digits[9]) && d2 === Number(digits[10]);
}

/**
 * "MM/AA" ou "MMAA" → "AAMM". Null se mês fora de 1-12 ou já expirado
 * (comparado ao mês/ano atual).
 */
export function expiryToAAMM(mmaa: string): string | null {
  const digits = onlyDigits(mmaa);
  if (digits.length !== 4) return null;

  const mm = digits.slice(0, 2);
  const aa = digits.slice(2, 4);
  const month = Number(mm);
  if (month < 1 || month > 12) return null;

  const now = new Date();
  const currentYear2 = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;
  const year2 = Number(aa);

  // ponytail: janela de 2 dígitos assumida como século 2000; suficiente para
  // validade de cartão (nunca > 99 anos no futuro).
  if (year2 < currentYear2 || (year2 === currentYear2 && month < currentMonth)) {
    return null;
  }

  return `${aa}${mm}`;
}

/** Formata em grupos de 4 dígitos, só para exibição no input. */
export function formatCardNumber(s: string): string {
  return onlyDigits(s)
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** Formata CPF como 000.000.000-00. */
export function formatCpf(s: string): string {
  const digits = onlyDigits(s).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
