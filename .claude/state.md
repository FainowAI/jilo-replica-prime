# Estado do projeto Jilo

## Última atualização
2026-04-22

## O que foi feito na última sessão (Sprint 3 — SEO + GEO)
- Script `scripts/generate-seo-files.ts` criado — gera 4 arquivos de SEO/GEO em build time
- `public/sitemap.xml` gerado com rotas estáticas + produtos + collections do Shopify
- `public/robots.txt` reescrito — agora permite explicitamente 11 AI crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.) e tem Disallow de rotas privadas
- `public/llms.txt` gerado — índice markdown curto para LLMs no padrão Answer.AI
- `public/llms-full.txt` gerado — contexto completo da marca (FAQ, cardápio, tom de voz) pronto para ingestão em ChatGPT/Claude/Perplexity
- `package.json` atualizado com scripts `seo` e hook `prebuild`
- Novo doc `.claude/fluxo-seo-geo.md` criado
- 3 requirements adicionados (R28, R29, R30)

## Histórico de sprints
- **Sprint 1 (2026-04-16)** — Área do cliente completa (auth, perfil, pedidos, endereços, timeline)
- **Sprint 2 (2026-04-16)** — Shopify customer sync + checkout gating
- **Sprint 3 (2026-04-22)** — SEO tradicional + GEO (llms.txt) com geração em build time

## Pendências
- Definir URL canônica de produção e setar `SITE_URL` no ambiente de build (atual fallback: `https://jilo.com.br`)
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
- Ao adicionar novo prato ao cardápio: rodar `npm run seed` depois `npm run seo` e comitar os arquivos gerados. Sem isso, LLMs respondem com cardápio desatualizado
- Se o domínio de produção mudar, setar `SITE_URL` antes do build e recomitar os 4 arquivos de SEO/GEO
- O fallback gracioso do `generate-seo-files.ts` garante que o build nunca quebra por causa do Shopify — mas também significa que um erro silencioso pode gerar sitemap incompleto. Monitorar logs do build
- `llms.txt` e `llms-full.txt` são padrões emergentes (proposta set/2024) — a spec pode evoluir. Monitorar llmstxt.org
