/**
 * Espelho literal de DELIVERY_AREAS / isAreaDeliverable em
 * src/lib/cepValidator.ts. Mudança na whitelist de áreas atendidas exige
 * atualizar os dois lados.
 */
const DELIVERY_AREAS = [
  { uf: "SP", cidades: ["São José dos Campos"] },
];

// Mesma normalização de src/lib/cepValidator.ts (ignora acento, caixa e espaços).
function normalizeCity(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Verifica se uma combinação (uf, cidade) está dentro da whitelist
 * DELIVERY_AREAS. Match na cidade ignora acento, caixa e espaços
 * ("Sao Jose Dos Campos" vale); UF comparado como veio (mesmo
 * comportamento do frontend).
 */
export function isAreaDeliverable(uf: string, city: string): boolean {
  const area = DELIVERY_AREAS.find((a) => a.uf === uf);
  if (!area) return false;
  if (!area.cidades || area.cidades.length === 0) return true;
  const normalizedCity = normalizeCity(city);
  return area.cidades.some((c) => normalizeCity(c) === normalizedCity);
}
