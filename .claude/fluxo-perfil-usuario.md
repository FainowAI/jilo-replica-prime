# Fluxo: Perfil de Usuário

## Visão geral
O perfil de usuário é armazenado no Supabase (tabela `profiles`), criado automaticamente via trigger quando um novo usuário se registra no auth. Contém dados pessoais e de endereço para entrega. Atualmente, o frontend NÃO tem UI de perfil implementada — a tabela existe mas não é consumida por nenhuma página.

## Arquivos envolvidos

### Integração Supabase
| Arquivo | Descrição |
|---------|-----------|
| `src/integrations/supabase/client.ts` | Client Supabase configurado com URL e anon key (hardcoded) |
| `src/integrations/supabase/types.ts` | Tipos TypeScript gerados — define interface `profiles` |

### Migration
| Arquivo | Descrição |
|---------|-----------|
| `supabase/migrations/20260304221228_*.sql` | Cria tabela profiles, RLS policies, function handle_new_user(), trigger on_auth_user_created |

## Tabelas do banco

### profiles
| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | UUID (PK) | NÃO | — | FK para auth.users(id) ON DELETE CASCADE |
| full_name | TEXT | SIM | NULL | Nome completo |
| phone | TEXT | SIM | NULL | Telefone |
| cpf | TEXT | SIM | NULL | CPF do usuário |
| cep | TEXT | SIM | NULL | CEP para entrega |
| address | TEXT | SIM | NULL | Rua/logradouro |
| address_number | TEXT | SIM | NULL | Número |
| address_complement | TEXT | SIM | NULL | Complemento |
| neighborhood | TEXT | SIM | NULL | Bairro |
| city | TEXT | SIM | NULL | Cidade |
| state | TEXT | SIM | NULL | Estado (UF) |
| created_at | TIMESTAMPTZ | SIM | now() | Data de criação |
| updated_at | TIMESTAMPTZ | SIM | now() | Data de atualização |

### RLS
- SELECT: `auth.uid() = id`
- UPDATE: `auth.uid() = id`
- INSERT: `auth.uid() = id`

### Triggers
- `on_auth_user_created` → `handle_new_user()` → insere profile vazio com o id do novo usuário

## Regras de negócio

1. **Criação automática**: Profile criado vazio (só `id`) quando o usuário se registra — campos preenchidos depois.
2. **RLS restritiva**: Cada usuário só acessa o próprio perfil — sem role admin.
3. **Sem validação de CPF**: Campo TEXT sem constraint — qualquer string aceita.
4. **updated_at não é automático**: Default `now()` na criação, mas NÃO atualiza no UPDATE. Precisa de trigger ou update manual.

## Fluxo do usuário (futuro — não implementado)
1. Usuário se registra (Supabase Auth) → trigger cria profile vazio
2. Usuário acessa página de perfil → lê dados via Supabase client
3. Usuário preenche/edita dados pessoais e endereço
4. Dados salvos via UPDATE na tabela profiles

## Integrações
| Integração | Tipo | Descrição |
|-----------|------|-----------|
| Supabase Auth | auth.users | Registro e login |
| Supabase DB | profiles | Dados de perfil e endereço |

## Gotchas e armadilhas
- Não há UI de perfil no frontend — tabela preparada mas não consumida
- `updated_at` NÃO atualiza automaticamente — precisa de trigger
- `cpf` não tem validação — qualquer string aceita
- `state` é TEXT livre — não é ENUM de UFs
- A anon key do Supabase está hardcoded no client.ts — deveria estar em .env
- Cascade delete: deletar usuário no auth remove o profile
- Não há campo `email` na tabela profiles — email vive no auth.users
- O botão de User (ícone) no Header existe mas não tem ação — placeholder para futura implementação
