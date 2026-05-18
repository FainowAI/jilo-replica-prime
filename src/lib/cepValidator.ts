export interface CepInfo {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;  // cidade
  uf: string;
  erro?: boolean;
}

export interface CepValidationResult {
  isValid: boolean;
  isDeliverable: boolean;
  cepInfo: CepInfo | null;
  message: string;
}

// Whitelist de áreas atendidas — expandir conforme operação
// Formato: { uf: string, cidades?: string[] }
// Se cidades estiver vazio, atende o estado inteiro
const DELIVERY_AREAS = [
  { uf: 'SP', cidades: ['São Paulo', 'Guarulhos', 'Osasco', 'Santo André', 'São Bernardo do Campo', 'São Caetano do Sul', 'Diadema', 'Mauá', 'Barueri', 'Cotia', 'Taboão da Serra', 'Itapevi', 'Carapicuíba', 'Embu das Artes', 'Itaquaquecetuba', 'Ferraz de Vasconcelos', 'Poá', 'Suzano', 'Mogi das Cruzes', 'Arujá'] },
];

/**
 * Verifica se uma combinação (uf, cidade) está dentro da whitelist DELIVERY_AREAS.
 * Versão síncrona, sem chamada à ViaCEP. Use para validar endereços já cadastrados
 * (em que `state` e `city` vêm direto do banco).
 *
 * Match case-insensitive na cidade. UF é comparado como veio (whitelist usa uppercase
 * e o CHECK do DB força uppercase — vide R11).
 */
export function isAreaDeliverable(uf: string, city: string): boolean {
  const area = DELIVERY_AREAS.find((a) => a.uf === uf);
  if (!area) return false;
  if (!area.cidades || area.cidades.length === 0) return true;
  return area.cidades.some((c) => c.toLowerCase() === city.toLowerCase());
}

export async function validateCep(cep: string): Promise<CepValidationResult> {
  const cleanCep = cep.replace(/\D/g, '');

  if (cleanCep.length !== 8) {
    return { isValid: false, isDeliverable: false, cepInfo: null, message: 'CEP deve ter 8 dígitos.' };
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!response.ok) {
      return { isValid: false, isDeliverable: false, cepInfo: null, message: 'Não foi possível verificar o CEP. Tente novamente.' };
    }

    const data: CepInfo = await response.json();

    if (data.erro) {
      return { isValid: false, isDeliverable: false, cepInfo: null, message: 'CEP não encontrado.' };
    }

    // Verificar se a área é atendida (reusa o helper síncrono)
    const deliverable = isAreaDeliverable(data.uf, data.localidade);

    if (deliverable) {
      return {
        isValid: true,
        isDeliverable: true,
        cepInfo: data,
        message: `Entregamos em ${data.localidade}/${data.uf}!`,
      };
    }

    return {
      isValid: true,
      isDeliverable: false,
      cepInfo: data,
      message: `Ainda não entregamos em ${data.localidade}/${data.uf}. Estamos expandindo! Deixe seu e-mail para ser avisado.`,
    };

  } catch {
    return { isValid: false, isDeliverable: false, cepInfo: null, message: 'Erro na conexão. Verifique e tente novamente.' };
  }
}

export function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return digits;
}
