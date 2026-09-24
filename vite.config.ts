import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Hosts = tudo que o app injeta como <script>: PostHog, gtag (ga4.ts) e Google One Tap
// (googleAuth.ts). Novo script externo => adicionar aqui, senão a CSP o bloqueia em prod.
// CSP só no build de produção: em dev o @vitejs/plugin-react-swc injeta um
// script inline de preamble para o Fast Refresh, e uma <meta> fixa quebraria o HMR.
const CSP =
  "script-src 'self' https://us.i.posthog.com https://*.i.posthog.com https://www.googletagmanager.com https://accounts.google.com; object-src 'none'; base-uri 'self'";
const cspPlugin = (): Plugin => ({
  name: "csp-meta",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
  ],
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), cspPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
