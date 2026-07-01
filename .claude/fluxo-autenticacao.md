# Fluxo: Autenticação

## Visão geral
Autenticação via Supabase Auth com email + senha. Sessão persistida em localStorage com auto-refresh. UI dupla: modal (Header) + páginas dedicadas (`/login`, `/cadastro`). Captação passiva adicional via Google One Tap para visitantes não logados.

## Arquivos envolvidos
| Arquivo | Descrição |
|---------|-----------|
| `src/contexts/AuthContext.tsx` | Provider global com `user`, `session`, `loading`, `signIn`, `signUp`, `signOut` |
| `src/components/AuthDialog.tsx` | Modal que alterna entre login e signup |
| `src/components/ProtectedRoute.tsx` | Wrapper de rotas que requer autenticação |
| `src/pages/Login.tsx` / `src/pages/Cadastro.tsx` | Páginas dedicadas |
| `src/components/sections/Header.tsx` | User icon → dropdown (logado) ou AuthDialog (deslogado) |
| `src/components/GoogleOneTap.tsx` | Popup nativo do Google (One Tap) para visitantes não logados, montado em `App.tsx` dentro do `AuthProvider` |

## Google One Tap
- Dispara ~5s após mount, 1x por sessão (`sessionStorage.jilo_one_tap_shown`), só se `!user` e `VITE_PUBLIC_GOOGLE_CLIENT_ID` estiver setado (no-op silencioso se vazio).
- Carrega o script `accounts.google.com/gsi/client` sob demanda, gera nonce (SHA-256) e chama `supabase.auth.signInWithIdToken({ provider: "google", token, nonce })`.
- Login efetuado dispara `SIGNED_IN` no `AuthContext` normalmente — customer-sync e PostHog identify já cobertos, nenhuma mudança no listener.
- Fail-soft: qualquer erro (script, credential, signIn) vira `console.warn`, sem toast de erro nem quebra de página.
- Requer `VITE_PUBLIC_GOOGLE_CLIENT_ID` (OAuth Web Client ID do Google Cloud, público) — vazio por padrão no `.env`.

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
