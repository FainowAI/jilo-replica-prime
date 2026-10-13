import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Hosts = tudo que o app injeta como <script>: PostHog, gtag (ga4.ts) e Google One Tap
// (googleAuth.ts). Novo script externo => adicionar aqui, senão a CSP o bloqueia em prod.
// CSP só no build de produção: em dev o @vitejs/plugin-react-swc injeta um
// script inline de preamble para o Fast Refresh, e uma <meta> fixa quebraria o HMR.
const CSP =
  "script-src 'self' https://us.i.posthog.com https://*.i.posthog.com https://www.googletagmanager.com https://accounts.google.com https://www.pagador.com.br; object-src 'none'; base-uri 'self'";
const cspPlugin = (): Plugin => ({
  name: "csp-meta",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
  ],
});

// ponytail: sem connect-src — a CSP atual não restringe conexões; adicionar um (incl. transaction[sandbox].pagador.com.br) exige mapear todos os hosts do app (Shopify, Supabase, ViaCEP, PostHog...).
const cspOn = (e: Record<string, string>) => e.VITE_VR_ENABLED === "true" || e.VITE_ALELO_ENABLED === "true";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // CSP entra no build só junto com a VR ou a Alelo (VITE_VR_ENABLED / VITE_ALELO_ENABLED = true): protege o formulário do cartão (A3)
  // e não muda o site em produção enquanto a VR está desligada.
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    cspOn(loadEnv(mode, process.cwd(), "VITE_")) && cspPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
