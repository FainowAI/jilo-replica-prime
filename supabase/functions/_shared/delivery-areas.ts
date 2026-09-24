/**
 * Espelho literal de DELIVERY_AREAS / isAreaDeliverable em
 * src/lib/cepValidator.ts. Mudança na whitelist de áreas atendidas exige
 * atualizar os dois lados.
 */
const DELIVERY_AREAS = [
  { uf: "SP", cidades: ["São José dos Campos"] },
];

/**
 * Verifica se uma combinação (uf, cidade) está dentro da whitelist
 * DELIVERY_AREAS. Match case-insensitive na cidade, UF comparado como veio
 * (mesmo comportamento do frontend).
 */
export function isAreaDeliverable(uf: string, city: string): boolean {
  const area = DELIVERY_AREAS.find((a) => a.uf === uf);
  if (!area) return false;
  if (!area.cidades || area.cidades.length === 0) return true;
  return area.cidades.some((c) => c.toLowerCase() === city.toLowerCase());
}
