# Fluxo: Perfil de Usuário

## Visão geral
O perfil de usuário é armazenado no Supabase (tabela `profiles`), criado automaticamente via trigger quando um novo usuário se registra no auth. Contém dados pessoais e de endereço para entrega. Atualmente, o frontend NÃO tem UI de perfil implementada — a tabela existe mas não é consumida por nenhuma página.

## Arquivos envolvidos

### Integração Supabase
| Arquivo | Descrição |
|---------|-----------|
| `src/integrations/supabase/client.ts` | Client Supabase configurado com URL e anon key |
| `src/integrations/supabase/types.ts` | Tipos TypeScript gerados automaticamente — define interface `profiles` |

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
- SELECT: auth.uid() = id (só vê o próprio perfil)
- UPDATE: auth.uid() = id (só edita o próprio perfil)
- INSERT: auth.uid() = id (só insere o próprio perfil)

### Triggers
- `on_auth_user_created` → executa `handle_new_user()` → insere profile vazio com o id do novo usuário

## Regras de negócio

1. **Criação automática**: O profile é criado vazio (só com `id`) quando o usuário se registra — todos os campos de dados são preenchidos depois.

2. **RLS restritiva**: Cada usuário só acessa o próprio perfil — não há role de admin ou acesso cruzado.

3. **Sem validação de CPF**: O campo `cpf` é TEXT sem constraint — não há validação de formato no banco.

4. **updated_at não é automático**: O default é `now()` na criação, mas NÃO há trigger para atualizar automaticamente no UPDATE. Se for implementar edição, precisa atualizar manualmente ou criar trigger.

## Fluxo do usuário
Atualmente não há fluxo de UI para perfil. A tabela existe preparada para quando o sistema de autenticação e edição de perfil for implementado.

**Fluxo esperado (futuro):**
1. Usuário se registra (Supabase Auth) → trigger cria profile vazio
2. Usuário acessa página de perfil → lê dados de profiles via Supabase client
3. Usuário preenche/edita dados pessoais e endereço
4. Dados salvos via UPDATE na tabela profiles

## Integrações
| Integração | Tipo | Descrição |
|-----------|------|-----------|
| Supabase Auth | auth.users | Registro e login de usuários |
| Supabase DB | profiles | Dados de perfil e endereço |

## Gotchas e armadilhas
- A tabela tem 0 registros — nenhum usuário se registrou ainda
- Não há UI de perfil no frontend — a tabela está preparada mas não consumida
- O `updated_at` NÃO atualiza automaticamente — precisa de trigger ou update manual
- O campo `cpf` não tem validação — qualquer string é aceita
- O `state` é TEXT livre — não é um ENUM de UFs. Pode receber qualquer valor.
- A anon key do Supabase está hardcoded no client.ts — é padrão Lovable mas deve ser movida para .env
- O cascade delete em `profiles.id → auth.users.id` garante que deletar o usuário no auth remove o profile
- Não há campo `email` na tabela profiles — o email vive no auth.users
