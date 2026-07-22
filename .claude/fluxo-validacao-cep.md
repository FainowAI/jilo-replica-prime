# Fluxo: Validação de CEP

## Visão geral
Validação de CEP via API ViaCEP para comunicar ao usuário se a região é atendida ANTES do checkout. A verificação é recomendada, NÃO obrigatória — se o usuário não verificar, o checkout funciona normalmente.

## Arquivos envolvidos

### Lib
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/cepValidator.ts` | Lógica de validação: `validateCep()` consulta ViaCEP e verifica contra whitelist. `formatCep()` formata input com máscara 00000-000. Interfaces: `CepInfo`, `CepValidationResult` |

### Componentes
| Arquivo | Descrição |
|---------|-----------|
| `src/components/CepChecker.tsx` | Input de CEP com botão "Verificar". Mostra resultado visual: verde (entregamos), amber (não entregamos), vermelho (CEP inválido). Callback `onResult` para integração com página pai |

### Páginas que usam
| Arquivo | Como usa |
|---------|---------|
| `src/pages/Carrinho.tsx` | CepChecker no resumo do pedido. Estado `deliveryCheck` + `canCheckout`. Se CEP verificado e não atendido → botão checkout desabilitado com "Região não atendida" |
| `src/components/conta/AddressFormDialog.tsx` | Usa `validateCep()` + `formatCep()` para autopreencher rua/bairro/cidade/UF ao digitar CEP de 8 dígitos (não valida cobertura, só preenche). Spinner inline durante a consulta |

## API externa

| API | URL | Método | Retorno |
|-----|-----|--------|---------|
| ViaCEP | `https://viacep.com.br/ws/{cep}/json/` | GET | JSON com `cep`, `logradouro`, `bairro`, `localidade` (cidade), `uf`, `erro` (boolean) |

## Whitelist de áreas atendidas

Definida em `DELIVERY_AREAS` no `cepValidator.ts`:

```typescript
const DELIVERY_AREAS = [
  { uf: 'SP', cidades: ['São Paulo', 'Guarulhos', 'Osasco', 'Santo André', 'São Bernardo do Campo', 'São Caetano do Sul', 'Diadema', 'Mauá', 'Barueri', 'Cotia', 'Taboão da Serra', 'Itapevi', 'Carapicuíba', 'Embu das Artes', 'Itaquaquecetuba', 'Ferraz de Vasconcelos', 'Poá', 'Suzano', 'Mogi das Cruzes', 'Arujá'] },
];
```

**Formato**: `{ uf: string, cidades?: string[] }`. Se `cidades` estiver vazio ou ausente, atende o estado inteiro.

## Regras de negócio

1. **Verificação NÃO obrigatória**: Se `deliveryCheck` é `null` (não verificou), o checkout funciona normalmente.

2. **CEP verificado e atendido** (`isDeliverable: true`): Mensagem verde "Entregamos em {cidade}/{uf}! Frete grátis, entrega em até 48h." Checkout liberado.

3. **CEP verificado e NÃO atendido** (`isDeliverable: false`): Mensagem amber "Ainda não entregamos em {cidade}/{uf}." Botão checkout desabilitado com texto "Região não atendida".

4. **CEP inválido** (`isValid: false`): Mensagem vermelha "CEP não encontrado" ou "CEP deve ter 8 dígitos." Checkout continua liberado (tratado como não verificado).

5. **Erro de conexão**: Mensagem "Erro na conexão. Verifique e tente novamente." Checkout continua liberado.

6. **Limpeza de estado**: Ao alterar o input do CEP, o resultado anterior é limpo (`setResult(null)`), reabilitando o botão de checkout.

## Como expandir a whitelist

Para adicionar uma nova cidade atendida, editar o array `DELIVERY_AREAS` em `src/lib/cepValidator.ts`:

```typescript
// Adicionar cidade em SP:
{ uf: 'SP', cidades: [...cidadesExistentes, 'Nova Cidade'] }

// Adicionar estado inteiro:
{ uf: 'RJ' }  // sem cidades = estado inteiro

// Adicionar estado com cidades específicas:
{ uf: 'RJ', cidades: ['Rio de Janeiro', 'Niterói'] }
```

A comparação de cidade é case-insensitive (`toLowerCase()`).

## Fluxo do usuário

### No Carrinho (/carrinho)
1. Usuário vê CepChecker no resumo do pedido com nota "Verifique antes de finalizar..."
2. Digita CEP → formatação automática (00000-000)
3. Clica "Verificar" ou pressiona Enter
4. Loading state no botão (spinner)
5. Resultado aparece: verde (entregamos), amber (não entregamos), vermelho (erro)
6. Se não entregamos → botão checkout mostra "Região não atendida"
7. Se alterar CEP → resultado limpa → checkout volta ao normal

## Gotchas e armadilhas

- ViaCEP é API gratuita sem SLA — se estiver fora do ar, o CepChecker exibe erro mas NÃO bloqueia o checkout
- A comparação de cidade usa `toLowerCase()` — acentos importam ("São Paulo" ≠ "Sao Paulo"). ViaCEP retorna com acentos corretos.
- O componente CepChecker é reutilizável (aceita `onResult` e `className`) — pode ser usado em Product.tsx ou Kit.tsx no futuro
- O botão "Verificar" tem `px-3 sm:px-5` para caber em telas de 320px
- Não há cache de consultas ViaCEP — cada verificação faz uma nova request
- A whitelist é estática no código — para gestão dinâmica, seria necessário mover para Supabase ou Shopify metafields
