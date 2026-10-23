# Fluxo: Perfil de Usuário e Área do Cliente

## Visão geral
A área do cliente Jilo é um sistema completo de gestão pessoal, acessível via `/conta/*` com autenticação obrigatória. Cobre: perfil editável, endereços múltiplos, lista de pedidos, detalhes de pedido com timeline de status. Implementada no Sprint 1 (Abril 2026).

## Arquivos envolvidos

### Autenticação
| Arquivo | Descrição |
|---------|-----------|
| `src/contexts/AuthContext.tsx` | Context provider global — expõe `user`, `session`, `signIn`, `signUp`, `signOut`. Escuta `onAuthStateChange` |
| `src/components/AuthDialog.tsx` | Modal reutilizável de login/cadastro (alterna entre modos) |
| `src/components/ProtectedRoute.tsx` | Guarda rotas — redireciona para `/login?redirect=X` se não autenticado |
| `src/pages/Login.tsx` | Página dedicada de login |
| `src/pages/Cadastro.tsx` | Página dedicada de cadastro |

### Layout da área do cliente
| Arquivo | Rota | Descrição |
|---------|------|-----------|
| `src/pages/Conta.tsx` | `/conta` | Layout com sidebar + `<Outlet />` |
| `src/components/conta/ContaSidebar.tsx` | — | Sidebar navegável (Perfil, Pedidos, Endereços, Sair) |

### Páginas aninhadas
| Arquivo | Rota | Descrição |
|---------|------|-----------|
| `src/pages/conta/Perfil.tsx` | `/conta/perfil` (+ index) | Editar nome, telefone, CPF |
| `src/pages/conta/Enderecos.tsx` | `/conta/enderecos` | Lista de endereços + CRUD |
| `src/pages/conta/Pedidos.tsx` | `/conta/pedidos` | Lista de pedidos do usuário |
| `src/pages/conta/PedidoDetalhe.tsx` | `/conta/pedidos/:id` | Detalhes com itens, timeline e endereço |

### Componentes da área do cliente
| Arquivo | Descrição |
|---------|-----------|
| `src/components/conta/AddressCard.tsx` | Card visual de endereço com ações |
| `src/components/conta/AddressFormDialog.tsx` | Dialog de criação/edição |
| `src/components/conta/OrderStatusBadge.tsx` | Badge colorido de status do pedido |
| `src/components/conta/OrderStatusTimeline.tsx` | Timeline vertical do histórico |

### Hooks de dados
| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/useProfile.ts` | `useProfile()`, `useUpdateProfile()` |
| `src/hooks/useAddresses.ts` | `useAddresses()`, `useCreateAddress()`, `useUpdateAddress()`, `useDeleteAddress()` |
| `src/hooks/useOrders.ts` | `useOrders()` — invoca a edge function `customer-orders` (pedidos direto da Shopify). Exporta as interfaces `CustomerOrder`, `CustomerOrderItem`, `CustomerOrderHistoryEntry`, `CustomerOrderShippingAddress` |
| `src/hooks/useOrderDetails.ts` | `useOrderDetails(id)` — deriva do cache de `useOrders()` (sem chamada de rede extra), acha o pedido por id |

### Edge function (fonte dos pedidos)
| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/customer-orders/index.ts` | Busca os pedidos do cliente logado na **Shopify Admin API** (`orders(query:"customer_id:...")`; se vier 0 pedidos, refaz por `email:` — pedido guest com o mesmo e-mail). Identidade vem do JWT (`getUser`), nunca do body (anti-IDOR). Reusa `_shared/shopify-admin-auth.ts`. `verify_jwt=true`. Mapeia o pedido Shopify → o shape que a UI já consome (order + items + history derivado). |

## Tabelas do banco (ver `fluxo-infraestrutura.md` para schema completo)
- `profiles` — dados pessoais + `shopify_customer_id` + `default_shipping_address_id`
- `addresses` — múltiplos endereços por usuário com `is_default`
- `orders` / `order_items` / `order_status_history` — **NÃO são mais lidas pela área do cliente**. Os pedidos exibidos ao usuário vêm ao vivo da Shopify Admin API (edge function `customer-orders`). Essas tabelas continuam populadas pelo webhook e servem backend/admin/Bling/Uber, mas: (a) o webhook nunca preenche `orders.user_id` (por isso a página ficava vazia), e (b) a captura estava incompleta. A fonte de verdade dos pedidos é a Shopify.

## Regras de negócio

1. **Login obrigatório em `/conta/*`** — `ProtectedRoute` redireciona pra `/login?redirect=<path>`
2. **Signup cria profile vazio** — trigger `handle_new_user` no DB faz isso automaticamente
3. **E-mail não editável** — vive em `auth.users`, profile só exibe
4. **Endereço default único** — trigger `ensure_single_default_address` desmarca os outros
5. **`profiles.default_shipping_address_id` é cache** — sync automático via trigger `sync_profile_default_address`
6. **Pedidos são read-only e vêm da Shopify** — a área do cliente busca ao vivo via edge function `customer-orders` (Admin API), filtrando por `customer_id` do cliente logado (do JWT). Usuário só visualiza.
7. **Status derivado da Shopify** — a Shopify só expõe status financeiro + de fulfillment; a function deriva o badge PT-BR (cancelled > refunded > dispatched(fulfilled) > paid > pending). A timeline é derivada dos dados Shopify (recebido → pago → enviado/rastreio), não da tabela `order_status_history`.
8. **Validação CEP no frontend** — regex `^[0-9]{5}-?[0-9]{3}$` espelha o CHECK do DB
9. **UF uppercase e 2 chars** — input auto-uppercase espelha CHECK do DB

## Fluxo do usuário

### Signup + primeiro login
1. Usuário clica em ícone User no Header → abre `AuthDialog` em modo signup
2. Preenche nome, e-mail, senha (min 6 chars)
3. Supabase envia e-mail de confirmação
4. Trigger `handle_new_user` cria profile vazio automaticamente
5. Após confirmação, usuário volta ao site e faz login
6. Redirecionado para `/conta/perfil` (ou `?redirect` se veio de rota protegida)

### Gestão de endereços
1. Acessa `/conta/enderecos`
2. Clica "Novo endereço" → abre `AddressFormDialog`
3. Preenche campos obrigatórios + marca "padrão" se quiser
4. `useCreateAddress` insere via Supabase com `user_id` automático
5. Trigger do DB garante unicidade de default
6. Lista recarrega via `queryClient.invalidateQueries`
7. **Cadastro inline no carrinho**: O `<AddressFormDialog />` também é usado pelo `<DeliveryAddressSelector />` no `/carrinho` — usuário sem endereço pode cadastrar sem sair da página de checkout. O modal funciona igual em ambos os contextos. Vide `.claude/fluxo-carrinho-checkout.md`.

### Visualização de pedidos
1. Acessa `/conta/pedidos` → `useOrders()` invoca a edge function `customer-orders`, que busca os pedidos do cliente logado na Shopify Admin API (por `customer_id`)
2. Clica em um pedido → navega para `/conta/pedidos/:id` (o `:id` é o id numérico do pedido Shopify)
3. `useOrderDetails(id)` deriva do cache de `useOrders()` (sem rede extra) e acha o pedido por id
4. Renderiza: itens, timeline derivada, resumo de valores, endereço de entrega, link de rastreio (se houver)
5. Sem ações de edição — tudo read-only

## Login/cadastro por e-mail e senha (mensagens fixas, reenvio de confirmação) — revisto em 13/10
Cadastro e login por e-mail/senha estão ativos (`/cadastro`, `/login`, `AuthDialog`) junto com o Google. Casos reais que motivaram a revisão (13/10): conta Google sem senha tentando senha; recadastro com e-mail existente (sucesso falso, sem e-mail); "Email not confirmed" cru em inglês; 2º cadastro em < 60 s (429 e o novo e-mail invalida o link do primeiro); modal da compra abrindo em "Criar conta"; `AuthDialog` que não fechava no login Google. Diagnóstico completo em `.claude/.work/login-google-shopify/plan.md` (enquanto existir).
- **Mensagens fixas, iguais para todos** (`src/lib/authHint.ts`): `authErrorKind(error)` classifica por `error.code` (fallback na mensagem em inglês / status 429) em `credenciais | nao_confirmado | limite | outro`; `authNotice(context, error, email)` devolve o texto. Nunca mostrar a mensagem crua do Supabase. Nenhuma tela diz se o e-mail existe ou qual método ele usa (o Supabase já devolve o mesmo `invalid_credentials` para senha errada e conta sem senha).
- **Dica de conta Google desativada (13/10, auditoria M1):** a edge `auth-login-hint` virou oráculo (o limite em memória não segurava: 46 de 46 consultas respondidas). Hoje é um stub (v8) que sempre responde `{hint:null}` só para o front antigo não quebrar; a RPC `auth_email_login_hint` foi removida (migration `20261013221839`). Apagar a edge no painel quando este front estiver publicado.
- **E-mail não confirmado:** texto pt-BR + botão "Reenviar e-mail" (`AuthContext.resendConfirmation` → `auth.resend({type:'signup'})`, `src/components/ResendConfirmation.tsx`) com contagem de 60 s (o Supabase aceita 1 envio por endereço a cada 60 s). Só aparece depois de `email_not_confirmed`, que o Supabase só devolve com a senha certa.
- **Pós-cadastro:** o `AuthDialog` e `/cadastro` não fecham/navegam; mostram "Confirme seu e-mail" (`ConfirmEmailNotice`) com reenviar (já em cooldown) e "Já confirmei, entrar". Isso evita o 2º cadastro.
- **Signup com e-mail já existente:** `user.identities = []` → `AuthContext.signUp` devolve `email_already_registered` (sem `cadastroConcluido`) → mensagem fixa e troca para o modo login.
- **`AuthDialog` fecha sozinho quando `user` aparece** (efeito + cleanup de desmontagem que avisa o pai). Cobre o login pelo botão Google dentro do modal. Os modais da compra (`DeliveryAddressSelector`, `Carrinho`) abrem em modo **login**.
- **Analytics:** `login efetuado`/`cadastro concluído` levam `metodo` (`senha`|`google`); falha vira `login falhou` com `metodo` + `motivo` normalizado. Nunca e-mail nem mensagem crua.

## Esqueci a senha
- Entradas: link "Esqueci a senha" no `AuthDialog` (modal do cabeçalho, carrinho e seletor de endereço; só no modo login, fecha o modal) e na página `/login`. Os dois levam o e-mail digitado em `state.email` e `/recuperar-senha` já abre preenchida. Até 2026-10-13 o link só existia em `/login`, e quase ninguém passava por lá.
- `/recuperar-senha` chama `resetPassword` → `resetPasswordForEmail` com `redirectTo` `<origin>/redefinir-senha`. A mensagem é neutra ("Se existir uma conta…") para não revelar se o e-mail tem conta. Dispara o template `recovery`.
- `/redefinir-senha` espera a sessão de recuperação (evento `PASSWORD_RECOVERY`) e grava a nova senha com `updatePassword`. No GoTrue, abrir o link de recuperação deve confirmar o e-mail de quem ficou preso em "Email not confirmed" (a confirmar no primeiro caso real).
- O `redirectTo` precisa estar no `uri_allow_list` do Supabase (`https://jilomarmitas.com/**` está). Em localhost não está: o link cairia no `site_url`, então não teste o envio pelo dev server.

## E-mails de autenticação (templates do Supabase Auth)
Os 6 e-mails que o Supabase envia têm a identidade da Jiló e assunto em pt-BR. A fonte da verdade são os arquivos em `supabase/templates/`. Publicação: `SUPABASE_ACCESS_TOKEN=sbp_... npm run auth:emails` (`scripts/publish-auth-emails.ts`). O script faz PATCH em `/v1/projects/{ref}/config/auth` só das chaves `mailer_subjects_*`/`mailer_templates_*_content` e relê os valores para conferir.
| Template | Assunto | Variáveis | Disparo |
|---|---|---|---|
| `confirmation` | Confirmar conta - JILO | `{{ .ConfirmationURL }}` | `signUp` (cadastro e-mail/senha) |
| `recovery` | Redefinir senha - JILO | `{{ .ConfirmationURL }}` | "Esqueci minha senha" → `/redefinir-senha` |
| `magic_link` | Seu link de acesso - JILO | `{{ .ConfirmationURL }}` | `signInWithOtp` (sem botão no site hoje) |
| `email_change` | Confirmar troca de e-mail - JILO | `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .ConfirmationURL }}` | `updateUser({email})`. Com secure email change ligado, vai para o endereço antigo E o novo, por isso o texto serve aos dois |
| `invite` | Seu convite para a Jiló - JILO | `{{ .ConfirmationURL }}` | "Invite user" no painel |
| `reauthentication` | Seu código de confirmação - JILO | `{{ .Token }}` (8 dígitos) | ação sensível que exige reautenticação |
- Molde: `confirmation.html`. Os outros 5 copiam a estrutura dele e mudam só o texto (o `reauthentication` troca botão e link pelo bloco do código).
- NUNCA usar `{{ .SiteURL }}` em href: o `site_url` do projeto está `jilomarmitas.com`, sem `https://`. Link fixo para o site é `https://jilomarmitas.com`.
- Links e códigos valem 1 hora (`mailer_otp_exp` = 3600).
- As 7 notificações de segurança (senha alterada, e-mail alterado, MFA, identidade vinculada etc.) seguem no padrão do Supabase em inglês, mas estão DESLIGADAS (`mailer_notifications_*_enabled=false`). Se alguém ligar, criar o template antes.
- Remetente: desde 2026-10-13 o envio sai pela **Resend** (SMTP `smtp.resend.com:465`, usuário `resend`) como `Jiló <nao-responda@jilomarmitas.com>`. A configuração foi feita pela integração nativa Resend → Supabase (OAuth na org "Jilo-marmitas"), que criou na Resend a API key "Supabase Integration" e a gravou como `smtp_pass`. Limite no Supabase: 25 e-mails/h (`rate_limit_email_sent`). Plano Free da Resend: 100/dia e 3.000/mês.
- Domínio na Resend: `jilomarmitas.com`, região São Paulo, sem rastreamento de clique/abertura (ele reescreveria os links de confirmação). DNS na Hostinger da Jiló: TXT `resend._domainkey` (DKIM), CNAME `send` → `send.forge.rmta.net`, CNAME `rsend` → `rsend-sae1.forge.rmta.net` e TXT `_dmarc` `v=DMARC1; p=none;`. O domínio NÃO recebe e-mail (sem MX na raiz), por isso o remetente é `nao-responda@`.
- Rollback: no painel do Supabase, Authentication → Emails → SMTP Settings, desligar "Enable custom SMTP" volta ao remetente padrão do Supabase (2/h).

## E-mails de autenticação (templates do Supabase Auth)
Os 6 e-mails que o Supabase envia têm a identidade da Jiló e assunto em pt-BR. A fonte da verdade são os arquivos em `supabase/templates/`. Publicação: `SUPABASE_ACCESS_TOKEN=sbp_... npm run auth:emails` (`scripts/publish-auth-emails.ts`). O script faz PATCH em `/v1/projects/{ref}/config/auth` só das chaves `mailer_subjects_*`/`mailer_templates_*_content` e relê os valores para conferir.
| Template | Assunto | Variáveis | Disparo |
|---|---|---|---|
| `confirmation` | Confirmar conta - JILO | `{{ .ConfirmationURL }}` | `signUp` (cadastro e-mail/senha) |
| `recovery` | Redefinir senha - JILO | `{{ .ConfirmationURL }}` | "Esqueci minha senha" → `/redefinir-senha` |
| `magic_link` | Seu link de acesso - JILO | `{{ .ConfirmationURL }}` | `signInWithOtp` (sem botão no site hoje) |
| `email_change` | Confirmar troca de e-mail - JILO | `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .ConfirmationURL }}` | `updateUser({email})`. Com secure email change ligado, vai para o endereço antigo E o novo, por isso o texto serve aos dois |
| `invite` | Seu convite para a Jiló - JILO | `{{ .ConfirmationURL }}` | "Invite user" no painel |
| `reauthentication` | Seu código de confirmação - JILO | `{{ .Token }}` (8 dígitos) | ação sensível que exige reautenticação |
- Molde: `confirmation.html`. Os outros 5 copiam a estrutura dele e mudam só o texto (o `reauthentication` troca botão e link pelo bloco do código).
- NUNCA usar `{{ .SiteURL }}` em href: o `site_url` do projeto está `jilomarmitas.com`, sem `https://`. Link fixo para o site é `https://jilomarmitas.com`.
- Links e códigos valem 1 hora (`mailer_otp_exp` = 3600).
- As 7 notificações de segurança (senha alterada, e-mail alterado, MFA, identidade vinculada etc.) seguem no padrão do Supabase em inglês, mas estão DESLIGADAS (`mailer_notifications_*_enabled=false`). Se alguém ligar, criar o template antes.
- Remetente: desde 2026-10-13 o envio sai pela **Resend** (SMTP `smtp.resend.com:465`, usuário `resend`) como `Jiló <nao-responda@jilomarmitas.com>`. A configuração foi feita pela integração nativa Resend → Supabase (OAuth na org "Jilo-marmitas"), que criou na Resend a API key "Supabase Integration" e a gravou como `smtp_pass`. Limite no Supabase: 25 e-mails/h (`rate_limit_email_sent`). Plano Free da Resend: 100/dia e 3.000/mês.
- Domínio na Resend: `jilomarmitas.com`, região São Paulo, sem rastreamento de clique/abertura (ele reescreveria os links de confirmação). DNS na Hostinger da Jiló: TXT `resend._domainkey` (DKIM), CNAME `send` → `send.forge.rmta.net`, CNAME `rsend` → `rsend-sae1.forge.rmta.net` e TXT `_dmarc` `v=DMARC1; p=none;`. O domínio NÃO recebe e-mail (sem MX na raiz), por isso o remetente é `nao-responda@`.
- Rollback: no painel do Supabase, Authentication → Emails → SMTP Settings, desligar "Enable custom SMTP" volta ao remetente padrão do Supabase (2/h).

## Integrações
| Integração | Tipo | Descrição |
|-----------|------|-----------|
| Shopify Admin API | edge function `customer-orders` | Fonte dos pedidos exibidos ao cliente — `orders(query:"customer_id:...")` com token admin OAuth cacheado |
| Supabase Auth | auth.users | Signup, login, sessão persistente em localStorage |
| Supabase DB | 5 tabelas | Profile, addresses, orders, order_items, order_status_history |
| RLS | Todas as tabelas | `auth.uid() = user_id` em queries — isolamento automático |
| TanStack Query | Cache | Todas as queries cachadas por `queryKey` + invalidação em mutations |

## Gotchas e armadilhas
- `AuthProvider` DEVE estar dentro do `BrowserRouter` (ProtectedRoute usa `useLocation`)
- **Pedidos vêm da Shopify, não do Supabase** — mudança de fonte feita em Jul/2026. A tabela `orders` do Supabase (via webhook) tinha `user_id` sempre NULL e captura incompleta, então a página ficava vazia. Agora a edge function `customer-orders` busca ao vivo por `customer_id`.
- `shopify_customer_id` **É preenchido** pela edge function `shopify-customer-sync` no login (SIGNED_IN) — a `customer-orders` depende dele (fallback por e-mail se ausente). O gotcha antigo "não é preenchido, Sprint 2" está OBSOLETO.
- **Limitação Shopify `read_orders` (~60 dias):** sem o scope `read_all_orders` (requer aprovação Shopify), pedidos com mais de ~60 dias podem sumir da lista. Aceito por ora; se necessário, solicitar `read_all_orders`.
- `useOrderDetails` NÃO faz rede — deriva do cache de `useOrders()`. Se o pedido não estiver na lista (ex.: link direto e lista ainda não carregou), a query de `useOrders` roda mesmo assim (é barata).
- Endereço de entrega da Shopify não separa número/bairro — `number` e `neighborhood` vêm `null` no shape mapeado.
- Escopo de acesso depende de **confirmação de e-mail obrigatória** (hoje login é OAuth Google, e-mail já verificado). Se habilitarem signup e-mail/senha sem confirmação, revisar (spoofing de e-mail).
- Validação de CPF não é implementada (campo TEXT livre) — débito técnico
- A anon key do Supabase continua hardcoded em `client.ts` — débito de segurança

### Guarda de vínculo Shopify (2026-10-16)

O campo `profiles.shopify_customer_id` foi gravável pelo próprio usuário no estado verificado em 13/10; formato GID canônico não comprova propriedade. Antes de buscar por `customer_id`, `customer-orders` consulta o cliente na Admin API e compara o ID e o e-mail da Shopify ao e-mail do JWT. Se a consulta falhar, se o GID for inválido ou se o e-mail divergir, a busca usa apenas o e-mail do JWT (com proteção da DSL de busca). Os drafts de VR/Cielo também só associam `purchasingEntity` quando ID e e-mail são confirmados. Os testes locais usam identidades sintéticas. A migration `20261013215411_profiles_trava_shopify_customer_id.sql` já consta do repositório; sua aplicação no Supabase Jiló e a revisão dos vínculos existentes não foram verificadas nesta sessão.
- `AddressFormDialog` autopreenche rua/bairro/cidade/UF ao digitar um CEP de 8 dígitos, via `validateCep()` (ViaCEP) — reusa `cepValidator.ts`. Número/complemento continuam manuais (ViaCEP não os fornece). CEP inválido não bloqueia: usuário preenche manual.
