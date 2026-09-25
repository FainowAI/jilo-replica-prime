/**
 * Validação de CPF no servidor — espelha `isValidCpf` de `src/lib/vr/card.ts`
 * (mesma regra: rejeita sequência repetida, valida os 2 dígitos verificadores).
 * Aqui a entrada já chega só-dígitos e com 11 chars (garantido pelo zod do
 * chamador), então não há normalização de máscara.
 */
export function isValidCpf(digits: string): boolean {
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
