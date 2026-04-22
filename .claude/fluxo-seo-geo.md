# Fluxo: SEO e GEO (Sitemap + llms.txt)

## Visão geral

A Jilo gera automaticamente 4 arquivos estáticos de SEO/GEO em cada build, via script Node que consulta a Shopify Admin API e escreve em `public/`. Como o projeto é um SPA Vite puro (sem SSR), essa é a única abordagem viável para manter sitemap e contexto para LLMs sempre atualizados.

## Arquivos gerados

| Arquivo | Propósito | Formato |
|---------|-----------|---------|
| `public/sitemap.xml` | SEO tradicional — índice de URLs para Googlebot/Bingbot | XML (Sitemaps Protocol 0.9) |
| `public/robots.txt` | Permissões de crawling para bots e LLMs | Texto plano |
| `public/llms.txt` | Índice curto para LLMs (navegação) | Markdown (spec Jeremy Howard) |
| `public/llms-full.txt` | Contexto completo da marca para ingestão direta | Markdown (spec Jeremy Howard) |

## Arquivos estáticos (não gerados, versionados manualmente)

Complementares aos arquivos gerados pelo script, estes são servidos pelo SPA estático e são cruciais para o que Googlebot e bots de IA veem na primeira passada (antes do JavaScript executar):

| Arquivo | Propósito |
|---------|-----------|
| `index.html` | Shell HTML servido a todos os crawlers. Contém meta tags SEO, Open Graph, Twitter Cards, favicon links, manifest link, e JSON-LD Organization + WebSite schemas. Sem react-helmet — tudo estático |
| `public/favicon.ico` | Ícone principal (multi-size 16/32/48) — exigido pelo Google para exibir na SERP |
| `public/favicon-16x16.png`, `public/favicon-32x32.png` | PNGs complementares para browsers modernos |
| `public/apple-touch-icon.png` | Ícone 180x180 para iOS |
| `public/android-chrome-192x192.png`, `public/android-chrome-512x512.png` | Ícones Android (referenciados também no manifest) |
| `public/site.webmanifest` | Manifest PWA-like — nome, ícones, theme color |
| `public/og-image.jpg` | Imagem 1200x630 usada nas previews sociais (Facebook, LinkedIn, WhatsApp, Twitter). Hospedada no próprio domínio para não depender do CDN temporário da Lovable |

## Arquivos envolvidos

### Script gerador
| Arquivo | Descrição |
|---------|-----------|
| `scripts/generate-seo-files.ts` | Script único que consulta Shopify Admin API e gera os 4 arquivos. Fallback gracioso se `SHOPIFY_ADMIN_TOKEN` estiver ausente |

### Integração com build
| Arquivo | Descrição |
|---------|-----------|
| `package.json` | Scripts `seo` (manual) e `prebuild` (automático antes de cada build) |

## Tabelas do banco

Nenhuma. A feature é puramente estática e não usa Supabase.

## Regras de negócio

1. **R28 — Rotas privadas fora do sitemap**: `/conta/*`, `/carrinho`, `/login`, `/cadastro` NÃO entram no sitemap.xml. Também têm `Disallow` explícito no robots.txt para o User-agent `*`.
2. **R29 — Geração automática, edição proibida**: os 4 arquivos são regenerados a cada `npm run build`. Editar manualmente é antipadrão — a próxima build sobrescreve.
3. **R30 — URL canônica única**: env var `SITE_URL` com fallback para `https://jilomarmitas.com`. Todas as URLs absolutas dos 4 arquivos usam essa fonte.
4. **Permissões de AI crawlers**: robots.txt permite explicitamente GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-Web, anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended, CCBot, Applebot-Extended.
5. **Tom de voz do llms-full.txt**: segue o padrão da marca definido em `jilo-context` skill — sem emojis, sem palavras proibidas (vácuo, industrial, barato, produto).

## Fluxo de build

```
npm run build
  ↓
prebuild hook dispara automaticamente
  ↓
npm run seo
  ↓
npx ts-node scripts/generate-seo-files.ts
  ↓
Fetch Shopify Admin API (produtos + collections ativas)
  ↓ (fallback gracioso se falhar)
Escrever public/sitemap.xml
Escrever public/robots.txt
Escrever public/llms.txt
Escrever public/llms-full.txt
  ↓
vite build procede normalmente
```

## Integrações

| Integração | Tipo | Endpoint | O que faz |
|-----------|------|----------|-----------|
| Shopify Admin API | REST | `/admin/api/2025-07/products.json` | Lista produtos ativos para popular sitemap e llms.txt |
| Shopify Admin API | REST | `/admin/api/2025-07/smart_collections.json` | Lista collections para links de categoria |

Ambos usam `SHOPIFY_ADMIN_TOKEN` (mesma env var dos scripts de seed).

## Gotchas e armadilhas

- Se `SHOPIFY_ADMIN_TOKEN` estiver ausente no ambiente de build, o script NÃO quebra — gera com rotas estáticas apenas. Isso é intencional: o build nunca deve falhar por causa da Shopify
- O `prebuild` roda automaticamente em `npm run build` — não precisa chamar `npm run seo` separadamente na CI/CD
- Arquivos gerados SÃO comitados ao repositório — para conseguir inspecionar diffs e não depender do pipeline de deploy rodar o `prebuild`
- O `llms-full.txt` deve ser regenerado sempre que o cardápio mudar (novos pratos, novas categorias) — caso contrário LLMs vão responder com informação desatualizada
- O `robots.txt` AGORA tem `Disallow` explícito para rotas privadas no User-agent `*` — isso é mais restritivo que a versão anterior, mas alinhado à R28
- A ordem das categorias no `llms.txt` e `llms-full.txt` é fixa: Aves e Suinos → Bovinos → Peixes e Massas → Veganos (mesma do FullMenu)
- Adicionar novo prato ao cardápio: rodar `npm run seed` (popular Shopify), depois `npm run seo` (regerar SEO), depois commit dos arquivos gerados
- Se a URL do site mudar (mudou domínio), setar `SITE_URL` no ambiente antes de rodar `npm run seo` e recomitar os arquivos gerados
- O `index.html` é a única fonte de meta tags globais (title, description, og:*, canonical) — o Googlebot e bots de IA NÃO executam o JavaScript na primeira passada, então tudo que importa precisa estar estático aqui. Se quiser meta tags por rota no futuro, usar react-helmet SEM remover as do `index.html` (elas são o fallback)
- NUNCA referenciar assets em `storage.googleapis.com/gpt-engineer-file-uploads/...` — é o CDN temporário da Lovable e expira. og:image, favicon, apple-touch-icon, etc. DEVEM viver em `public/`
- Se trocar o logo ou a og:image, lembrar de forçar recrawl no Google Search Console (URL Inspection > Request Indexing) — caso contrário o Google pode levar semanas para atualizar
- Placeholder de `google-site-verification` está comentado no `index.html` — preencher após criar a propriedade no GSC (método primário de verificação é DNS TXT, este é backup)

## Como validar

Após `npm run seo`, verificar em `public/`:

1. **sitemap.xml**: abrir no navegador, conferir que aparecem todas as rotas públicas + produtos + collections. Validar XML em https://www.xml-sitemaps.com/validate-xml-sitemap.html
2. **robots.txt**: conferir que tem `Sitemap: https://jilomarmitas.com/sitemap.xml` no final
3. **llms.txt**: abrir e conferir estrutura markdown (H1 Jilo, blockquote, seções H2)
4. **llms-full.txt**: conferir que tem FAQ completo + cardápio listado + tom de voz

Teste de ingestão: colar o conteúdo de `llms-full.txt` em uma conversa com ChatGPT/Claude e perguntar "me conte sobre a Jilo". A resposta deve refletir o tom oficial da marca.
