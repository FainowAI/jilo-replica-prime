# Fluxo: Autenticação

## Visão geral
Autenticação via Supabase Auth com email + senha **ou Google** (id_token via `signInWithIdToken`). Sessão persistida em localStorage com auto-refresh. UI dupla: modal (Header) + páginas dedicadas (`/login`, `/cadastro`). Captação de Google para visitantes não logados em dois formatos: One Tap nativo (canto sup. direito) + popup central de destaque.

## Arquivos envolvidos
| Arquivo | Descrição |
|---------|-----------|
| `src/contexts/AuthContext.tsx` | Provider global com `user`, `session`, `loading`, `signIn`, `signUp`, `signOut` |
| `src/components/AuthDialog.tsx` | Modal que alterna entre login e signup |
| `src/components/ProtectedRoute.tsx` | Wrapper de rotas que requer autenticação |
| `src/pages/Login.tsx` / `src/pages/Cadastro.tsx` | Páginas dedicadas |
| `src/components/sections/Header.tsx` | User icon → dropdown (logado) ou AuthDialog (deslogado) |
| `src/lib/googleAuth.ts` | Módulo compartilhado GSI: carrega script, gera **1 nonce por página**, `initialize` único, handler `signInWithIdToken`. Expõe `promptGoogleOneTap()` e `renderGoogleButton()` |
| `src/components/GoogleOneTap.tsx` | Prompt nativo do One Tap (canto), 1x/sessão, via `googleAuth`. Montado em `App.tsx` dentro do `AuthProvider` |
| `src/components/GoogleLoginPopup.tsx` | Popup **central** (shadcn Dialog) que auto-abre 1x/sessão p/ deslogado (~3s). Contém o botão Google + link "entrar com e-mail". Montado em `App.tsx` |
| `src/components/GoogleSignInButton.tsx` | Botão oficial "Sign in with Google" (`renderButton`) reutilizável — usado no popup, `AuthDialog`, `/login` e `/cadastro` |

## Login com Google
Três pontos de entrada, **todos pelo mesmo fluxo** `signInWithIdToken` centralizado em `src/lib/googleAuth.ts`:
1. **One Tap nativo** (`GoogleOneTap`) — prompt no canto sup. direito (FedCM), ~5s após mount, 1x/sessão (`sessionStorage.jilo_one_tap_shown`).
2. **Popup central** (`GoogleLoginPopup`) — modal centralizado de destaque, auto-abre ~3s após mount, 1x/sessão (`sessionStorage.jilo_login_popup_shown`). Fecha sozinho quando o login efetiva.
3. **Botão** (`GoogleSignInButton`) — botão oficial do Google renderizado sob demanda no `AuthDialog`, `/login` e `/cadastro`.

Detalhes técnicos:
- **`googleAuth.ts` faz `initialize` UMA vez por página, com UM nonce compartilhado** entre prompt e botões. `initialize` é singleton global — nonces diferentes por consumidor fariam o último vencer e quebrar a validação de nonce do Supabase. Este é o ponto crítico de correção do módulo.
- Nonce: bruto para o `signInWithIdToken`, hasheado (SHA-256 hex) para o Google.
- Login efetuado dispara `SIGNED_IN` no `AuthContext` normalmente — customer-sync e PostHog identify já cobertos, nenhuma mudança no listener.
- Fail-soft: qualquer erro (script, credential, signIn) vira `console.warn`, sem toast de erro nem quebra de página. Sem `VITE_PUBLIC_GOOGLE_CLIENT_ID`, tudo é no-op silencioso (prompt não dispara, botão não renderiza).
- Requer `VITE_PUBLIC_GOOGLE_CLIENT_ID` (OAuth Web Client ID do Google Cloud, público) — vazio por padrão no `.env`.
- **Limitação FedCM:** o One Tap nativo não pode ser recentralizado quando `use_fedcm_for_prompt: true` (o navegador controla posição). Por isso o "destaque central" é o `GoogleLoginPopup` (Dialog próprio), não o One Tap reposicionado.

## Regras de negócio
1. Senha mínima: 6 caracteres
2. E-mail precisa ser confirmado (link enviado pelo Supabase)
3. `emailRedirectTo: /conta` no signUp
4. Sessão persiste em `localStorage` com auto-refresh de token
5. `onAuthStateChange` mantém o app sincronizado em real-time
6. Logout limpa a sessão — efeito propaga via AuthContext

## Gotchas
- `AuthProvider` DEVE estar dentro do `BrowserRouter`
- Mensagens do Supabase vêm em inglês — `AuthDialog` traduz "Invalid login credentials"
- Trigger `handle_new_user` no DB cria profile vazio — nada de manual no frontend

## Sincronização com Shopify
Após o primeiro update de perfil de cada usuário, o hook `useUpdateProfile` dispara a edge function `shopify-customer-sync` que cria um customer no Shopify e grava o GID em `profiles.shopify_customer_id`. Ver detalhes em `fluxo-shopify-sync.md`.
