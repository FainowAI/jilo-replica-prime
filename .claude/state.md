# Estado do projeto Jilo

## Última atualização
2026-04-22 (sessão Sprint 3.5 — correção de meta tags estáticas e favicon)

## O que foi feito na última sessão (Sprint 3.5 — SEO fix: meta tags estáticas + favicon)
- Reescrito `<head>` do `index.html` com canonical, og:url, og:locale, og:site_name, favicon multi-size, apple-touch-icon, manifest link, Organization JSON-LD, WebSite JSON-LD com SearchAction, placeholder google-site-verification
- Substituído `public/favicon.ico` corrompido (era Targa 32x219) por ICO válido multi-size gerado no favicon.io
- Adicionados em `public/`: favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png, android-chrome-192x192.png, android-chrome-512x512.png, site.webmanifest, og-image.jpg (1200x630 própria, sem dependência do CDN Lovable)
- Regerado `public/robots.txt` via `npm run seo` — URL do sitemap corrigida de `jilo.com.br` para `jilomarmitas.com`
- Novas regras R31, R32, R33 registradas em requirements.md
- `fluxo-seo-geo.md` atualizado com seção "Arquivos estáticos" e novos gotchas

## Histórico de sprints
- **Sprint 1 (2026-04-16)** — Área do cliente completa (auth, perfil, pedidos, endereços, timeline)
- **Sprint 2 (2026-04-16)** — Shopify customer sync + checkout gating
- **Sprint 3 (2026-04-22)** — SEO tradicional + GEO (llms.txt) com geração em build time + correção do domínio canônico
- **Sprint 3.5 (2026-04-22)** — Correção do shell HTML: meta tags estáticas completas, favicon válido, og-image própria, robots.txt regenerado

## Pendências
- Submeter `sitemap.xml` no Google Search Console (método: Domain property + DNS TXT verification) e Bing Webmaster Tools após o go-live
- Request Indexing no GSC para home, /cardapio e /colecao/* após deploy do Sprint 3.5
- Preencher `<meta name="google-site-verification" content="..." />` no index.html após criar a propriedade no GSC (hoje está comentado)
- Substituir og-image.jpg provisória por versão branded oficial se foi usado fallback com foto de prato (validar com time de design)
- Testar ingestão do `llms-full.txt` em conversas com ChatGPT, Claude e Perplexity — validar se o tom oficial da marca aparece corretamente
- Débito técnico carryover (Sprint 2): testar fluxo end-to-end de signup → confirmação de email → sync Shopify
- Débito técnico carryover (Sprint 1): validação de CPF com máscara + checksum
- Débito técnico carryover (Sprint 1): integração ViaCEP no AddressFormDialog
- Débito de segurança carryover: migrar anon key do Supabase para `.env`
- Monitorar SERP do Google por 2-4 semanas — se favicon/descrição não atualizarem, considerar prerendering (react-snap, Prerender.io, ou migração para Next.js)

## Próximos passos planejados
Sprint 4 — Backend de pedidos ligado ao checkout:
1. Extender `shopify-webhook-receiver` para popular `order_items` (tabela normalizada)
2. Garantir que `orders.user_id` seja preenchido via lookup por email quando webhook chegar
3. Webhook `customers/update` para refletir mudanças do Shopify no Supabase
4. Integração Bling ERP

## Notas para a próxima sessão
- Domínio canônico do site é `https://jilomarmitas.com` — usar sempre essa URL em qualquer referência a links absolutos
- Ao adicionar novo prato ao cardápio: rodar `npm run seed` depois `npm run seo` e comitar os arquivos gerados
- Ao trocar logo ou og-image: substituir arquivos em `public/`, commitar, publicar, e forçar Request Indexing no GSC
- `llms.txt` e `llms-full.txt` são padrões emergentes — a spec pode evoluir. Monitorar llmstxt.org
- Se em qualquer momento surgir necessidade de adicionar subdomínio (ex: blog.jilomarmitas.com), criar sitemap separado e referenciá-lo no robots.txt
- Meta tags globais continuam no `index.html` estático (R31). Se o projeto crescer e precisar de meta tags por rota (ex.: SEO por produto na página `/produto/:handle`), adicionar `react-helmet-async` sem remover o que está no shell — o shell é fallback para quem não roda JS
