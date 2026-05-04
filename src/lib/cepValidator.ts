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

    // Verificar se a área é atendida
    const areaMatch = DELIVERY_AREAS.find(area => {
      if (area.uf !== data.uf) return false;
      if (!area.cidades || area.cidades.length === 0) return true;  // estado inteiro
      return area.cidades.some(c => c.toLowerCase() === data.localidade.toLowerCase());
    });

    if (areaMatch) {
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
