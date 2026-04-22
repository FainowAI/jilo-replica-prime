# Estado do projeto Jilo

## Última atualização
2026-04-22

## O que foi feito na última sessão (Sprint 3 — SEO + GEO, correção de domínio)
- Sprint 3 inicial: script `scripts/generate-seo-files.ts` criado, 4 arquivos SEO/GEO gerados, hook `prebuild` no package.json, doc `.claude/fluxo-seo-geo.md` criado
- Correção cirúrgica: fallback da `SITE_URL` em `scripts/generate-seo-files.ts` estava com `https://jilo.com.br` — corrigido para `https://jilomarmitas.com` (domínio real do site)
- Regra R30 em `.claude/requirements.md` atualizada com a URL correta
- Menções à URL antiga em `.claude/fluxo-seo-geo.md` sincronizadas
- Arquivos gerados em `public/` (sitemap.xml, robots.txt, llms.txt, llms-full.txt) já estavam corretos — foram gerados com a env var `SITE_URL` setada na execução original

## Histórico de sprints
- **Sprint 1 (2026-04-16)** — Área do cliente completa (auth, perfil, pedidos, endereços, timeline)
- **Sprint 2 (2026-04-16)** — Shopify customer sync + checkout gating
- **Sprint 3 (2026-04-22)** — SEO tradicional + GEO (llms.txt) com geração em build time + correção do domínio canônico

## Pendências
- Submeter `sitemap.xml` no Google Search Console e Bing Webmaster Tools após o go-live
- Testar ingestão do `llms-full.txt` em conversas com ChatGPT, Claude e Perplexity — validar se o tom oficial da marca aparece corretamente
- Débito técnico carryover (Sprint 2): testar fluxo end-to-end de signup → confirmação de email → sync Shopify
- Débito técnico carryover (Sprint 1): validação de CPF com máscara + checksum
- Débito técnico carryover (Sprint 1): integração ViaCEP no AddressFormDialog
- Débito de segurança carryover: migrar anon key do Supabase para `.env`

## Próximos passos planejados
Sprint 4 — Backend de pedidos ligado ao checkout:
1. Extender `shopify-webhook-receiver` para popular `order_items` (tabela normalizada)
2. Garantir que `orders.user_id` seja preenchido via lookup por email quando webhook chegar
3. Webhook `customers/update` para refletir mudanças do Shopify no Supabase
4. Integração Bling ERP

## Notas para a próxima sessão
- Domínio canônico do site é `https://jilomarmitas.com` — usar sempre essa URL em qualquer referência a links absolutos
- Ao adicionar novo prato ao cardápio: rodar `npm run seed` depois `npm run seo` e comitar os arquivos gerados
- `llms.txt` e `llms-full.txt` são padrões emergentes — a spec pode evoluir. Monitorar llmstxt.org
- Se em qualquer momento surgir necessidade de adicionar subdomínio (ex: blog.jilomarmitas.com), criar sitemap separado e referenciá-lo no robots.txt
