# Estado do projeto Jilo

## Última atualização
2026-06-30 (Sprint A da EAP Visibilidade de Dados **FECHADO**: webhooks Shopify registrados (`orders/create`+`paid`+`fulfilled`) sob o app customizado + QA validado ponta a ponta (pedido #1005 → `webhook_events`/`orders`/`order_items`). Branch `main`. Ver sessão abaixo.)

2026-06-28 (Analytics destravado. Causa raiz: variáveis `VITE_` estavam nos Secrets do Supabase (canal errado) → bundle de prod saía sem a key do PostHog. Criado `.env` commitado com as públicas, ajustado `.gitignore`. PostHog + GA4 validados em produção. Branch `main`)

## Sessão 2026-06-30 — Path B: endereço resolvido no webhook (CAUSA RAIZ real)

**Reporte:** mesmo após o fix de cart (`cartDeliveryAddressesAdd`), pedido real `#1008` ainda vinha sem endereço (`shippingAddress: null`).

**CAUSA RAIZ REAL (mais profunda que a API de cart):** os produtos da loja são **`requiresShipping: false`** (confirmado: 25 de 26 variants + o variant "Frete Uber Direct"; única exceção "Estrogonofe de Proteína de Soja"=true). Quando o carrinho só tem itens sem envio, **a Shopify NÃO coleta endereço no checkout** (`shippingAddress`/`shippingLine` sempre null) e **ignora** qualquer `cartDeliveryAddressesAdd`/`deliveryAddressPreferences`. O `seed-products.ts` nunca seta `requires_shipping`. ⚠️ Isso também fazia o **`uber-create-delivery` abortar** (ele exige `order.shipping_address.address1`/`city`).

**Decisão (gate de arquitetura, escolha do usuário):** **Path B** — manter o modelo Uber + variant fantasma (não mexer no frete nativo da Shopify) e **resolver o endereço no backend** a partir do `selected_address_id`. (Path A = ligar requiresShipping + shipping rate nativo, descartado por ora.)

**Implementação (1 feature-coder, ponytail) — `supabase/functions/shopify-webhook-receiver/index.ts`:**
- Novos helpers `extractSelectedAddressId(payload)` + `resolveShippingAddress(payload)`: se `payload.shipping_address` for null, lê o `selected_address_id` dos note_attributes, busca na tabela `addresses` (service_role) e monta o JSONB no shape que o `uber-create-delivery` consome (`address1/address2/city/province/province_code/zip/country/country_code/first_name/last_name/name/phone`). Sem log de PII.
- Fiação nos handlers `orders/create` e `orders/paid`: `if (!orderData.shipping_address) orderData.shipping_address = await resolveShippingAddress(payload)` ANTES do upsert (garante que o dispatch Uber subsequente leia o endereço do banco).
- **Deployado: v32** (`verify_jwt:false` preservado — usa HMAC).

**Verificação ponta-a-ponta (dado real):** draft com `selected_address_id=6798834d-...` → pedido **#1009 PAID** → `orders.shipping_address` populado: "Rua 15 de Novembro, 50 / Centro / São José dos Campos / SP / 12249-027 / Antônio Oliveira". ✅

**⚠️ Consequência p/ a UI/admin:** o endereço fica no NOSSO `orders.shipping_address` (alimenta Uber + painel próprio), **NÃO no Admin da Shopify** (a Shopify nunca o coletou). Se um dia quiserem o endereço no Admin Shopify, é o Path A (requiresShipping=true + shipping rate).

**Pendência — fix de cart virou INERTE:** com requiresShipping=false, o `setCartDeliveryAddress` (`cartDeliveryAddressesAdd`) no frontend é no-op (Shopify ignora). Decidir: remover (limpeza) ou manter como future-proof p/ Path A. Hoje só o `selected_address_id` (note_attribute) importa para o Path B.

## Sessão 2026-06-30 — Fix: endereço de entrega não chegava à Shopify

**Reporte (pedido real #1006+):** pedido no Admin mostrava "Nenhum endereço de entrega informado"; só chegavam note_attributes `selected_address_id`, `delivery_method`, `return_url`. Billing aparecia (vem do pagamento/CPF), shipping não.

**Causa raiz (2 code-explorer despachados):** o checkout gravava só o `selected_address_id` (UUID) como note_attribute via `cartAttributesUpdate`; **nunca enviava endereço estruturado** à Shopify (zero uso de `cartBuyerIdentityUpdate`/`cartDeliveryAddressesAdd`/`buyerIdentity` no projeto). O objeto `Address` completo existia em memória no `DeliveryAddressSelector` (cache do `useAddresses()`) mas não era propagado ao `handleCheckout` (só a string id).

**Correção (1 feature-coder, método ponytail, 2 arquivos):**
- `src/lib/shopify.ts`: novo `setCartDeliveryAddress(cartId, address)` + `CART_BUYER_IDENTITY_UPDATE_MUTATION` — mapeia `Address`→`MailingAddressInput` (⚠️ Storefront usa `province`/`country` em texto, NÃO `provinceCode`/`countryCode` da Admin) e envia via `deliveryAddressPreferences`. Fail-soft se faltar street/cep.
- `src/pages/Carrinho.tsx`: reusa `useAddresses()` (queryKey dedupe), resolve o endereço por id e chama `setCartDeliveryAddress` nos 2 pontos de checkout (handleCheckout + effect pós-login), fail-soft (R26). Mantém o `selected_address_id` attribute.
- Regras: **R48.1** em `requirements.md` + `fluxo-carrinho-checkout.md` atualizado.

**Verificação:** `tsc --noEmit` limpo + `npm run build` ok. **Mutation validada AO VIVO** contra Storefront 2025-07 (cart descartável + token público): `cartBuyerIdentityUpdate` aceito, `userErrors: []`, sem erros GraphQL — confirma que o shape está certo e o fail-soft não mascara bug. **Validação ponta-a-ponta pendente:** 1 checkout real pós-deploy → conferir que `orders.shipping_address`/`customer_name` populam.

**⚠️ Storefront vs Admin MailingAddressInput:** Storefront `MailingAddressInput` = `province`/`country` (texto); Admin = `provinceCode`/`countryCode`. Não copiar o padrão da edge `shopify-customer-sync` (Admin) para código de Cart frontend.

**🔧 CORREÇÃO (mesmo dia, após checkout de teste do usuário ainda vir sem endereço):** o 1º fix via `deliveryAddressPreferences` (`cartBuyerIdentityUpdate`) estava **errado** — é só *prefill* de checkout, não anexa endereço ao cart, não é legível de volta via API e NÃO populava o `shipping_address` do pedido (por isso "passou" no teste de cart vazio mas falhou no checkout real). Trocado por **`cartDeliveryAddressesAdd` com `selected: true`** (`setCartDeliveryAddress` em `shopify.ts`), validado ao vivo: o endereço anexa e é legível em `cart.delivery.addresses` (`selected:true`). ⚠️ **2 APIs irmãs, campos DIFERENTES:** `cartDeliveryAddressesAdd`/`CartDeliveryAddressInput` usa `provinceCode`/`countryCode` (códigos), enquanto `deliveryAddressPreferences`/`MailingAddressInput` usa `province`/`country` (texto). `cartDeliveryAddressesReplace` não existe na 2025-07. (O fix ERRADO via deliveryAddressPreferences foi commitado/pushado em `998b36c`; a correção `cartDeliveryAddressesAdd` está **só no working tree** — `src/lib/shopify.ts` modificado, ainda NÃO commitado.) **Pendências:** commitar+pushar a correção → rebuild no Lovable → 1 checkout real → conferir `orders.shipping_address` populado.

## Sessão 2026-06-30 — Sprint A (Captação Shopify) ativado + QA validado

**Contexto:** o usuário pediu para "começar a 1ª sprint" da EAP `eap_visibilidade_dados.md`. Reconciliação (Fase 2.6) revelou que **todo o código das Sprints A/B/C já estava mergeado na `main`** (commits `b2e8dd0` A, `ac66a9f` B, `6691699` C; PR #9). Não havia código novo a construir. A metade do **cliente** (A.1) já estava fluindo: **6/6 profiles** com `shopify_customer_id` (EAP dizia 0/6). O único gap real era a metade dos **pedidos**: `webhook_events`/`orders`/`order_items` zerados porque os **webhooks nunca foram registrados** (`webhookSubscriptions` vazio na Shopify).

**Ação (ativação, não construção):**
- Rodada a edge `register-shopify-webhooks` → criou as 3 subscriptions (`ORDERS_CREATE`/`PAID`/`FULFILLED`) apontando para `…/shopify-webhook-receiver`, sob o **app customizado** (token via `client_credentials`). Re-rodada confirmou idempotência (`existing: [3]`).
- ⚠️ **GOTCHA DE INFRA (importante p/ próximas sessões):** as edge functions guardadas por `token === SUPABASE_SERVICE_ROLE_KEY` (ex.: `register-shopify-webhooks`) **NÃO aceitam mais o JWT legacy `service_role`** — o projeto tem o **novo sistema de API keys ativo** (existe `sb_publishable_…`), e o runtime das Edge Functions passou a injetar a **secret key nova (`sb_secret_…`)** em `SUPABASE_SERVICE_ROLE_KEY`. O JWT legacy ainda valida no PostgREST/REST, mas falha (401) no guard interno dessas funções. **Para invocá-las use a `sb_secret_…`** (Painel → Settings → API Keys → Reveal).
- ⚠️ Webhooks na Shopify são **escopados por app**: a query `webhookSubscriptions` pelo conector MCP (outro app) retorna `[]` mesmo com as subscriptions ativas — só o app customizado as enxerga. Isso é o que garante que o **HMAC bate** (Shopify assina com o secret do app criador = `SHOPIFY_WEBHOOK_SECRET`). Validação autoritativa = report da própria `register-shopify-webhooks`.

**QA (A.3.1) — validado ao vivo:** draft order via MCP (1× Filé de Frango Pizzaiolo) → `draftOrderComplete(paymentPending:false)` → pedido **#1005 PAID**. Resultado no banco: `webhook_events`=2 (`orders/create`+`orders/paid`, ambos `processed=true` → **HMAC ok**), `orders`=1 (`status=paid`), `order_items`=1 (qty 1, 1998 cents). `delivery_method=uber_direct`/`pending_dispatch` **sem dispatch Uber** (draft não tem `uber_quote_id` → receiver só logou warning; fail-safe de R36 correto).

**Pendência de limpeza:** pedido de teste **#1005** (tag `QA-TEST`, email `qa-test@jilomarmitas.com`) segue como pago/pendente de fulfillment na Shopify — **arquivar/cancelar** para não poluir métricas. Linhas de teste em `orders`/`order_items`/`webhook_events` permanecem como evidência (decidir se limpa).

**Nota de doc desatualizada (fora do escopo, reportado):** `CLAUDE.md` diz "NÃO há tabelas de produtos/pedidos no Supabase" — a parte de **pedidos** está obsoleta (`orders`/`order_items`/`webhook_events` existem e estão populadas). Produtos seguem só na Shopify (correto). Ajustar quando o usuário quiser.

## Sessão 2026-06-28 — Analytics destravado (variáveis VITE_ no cofre errado)

**Reporte/diagnóstico:** PostHog e GA4 corretamente implementados no código (`src/analytics/*`), mas nenhum evento chegava ao painel. Causa raiz medida: o bundle de produção **não continha `phc_`** — a `VITE_PUBLIC_POSTHOG_KEY` chegou ao build como `undefined`. As variáveis `VITE_*` de analytics estavam cadastradas nos **Secrets do Supabase** (que só alimentam Edge Functions, **nunca** o build do Vite), não existia `.env` versionado no repo, e o `.gitignore` bloqueava `.env`/`.env.*`. O código estava certo — problema 100% de **configuração de ambiente** (variável pública no cofre errado). Sem alteração de regra de negócio.

**Correção (3 arquivos, sem tocar em código de app):**
- `.gitignore` — bloco env reescrito: passa a **permitir `.env`** (`!.env`) e mantém `.env.local`/`.env.*.local` ignorados.
- `.env` (raiz, commitado) — criado só com as **8 variáveis `VITE_*` públicas** (Supabase anon/URL/project-id, `VITE_SITE_URL`, shipping variant ID, PostHog key/host, GA4 ID). **Segredos reais removidos** (estavam misturados no `.env` local antigo: `SHOPIFY_*`, `UBER_*`, `JILO_PICKUP_*`) — backup local no scratchpad.
- `.env.example` — criado documentando as variáveis esperadas.

**Passos manuais (usuário):** remover as `VITE_*` dos Secrets do Supabase (M2); republish/rebuild no Lovable (M3).

**Verificação (V1):** `phc_rDBmhU39` presente no bundle de produção; `window.posthog.__loaded === true` em `jilomarmitas.com`; `$pageview` chegando ao PostHog + `page_view` no Tempo real do GA4. **PostHog + GA4 validados em produção.**

**🔴 Pendência de segurança (registrada, adiada pelo usuário):** `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_CLIENT_SECRET` e `UBER_CLIENT_SECRET` apareceram em texto puro fora do cofre → **rotacionar os três** por precaução.

**Docs:** `requirements.md` ganhou **R78** (cofres de env separados); `fluxo-analytics.md` atualizado (canal `.env` vs Secrets + lição de configuração); este `state.md`.

## Sessão 2026-06-28 — Fix vazamento de RLS (orders, webhook_events) + regra permanente

**Reporte:** tabelas `orders`, `profiles`, `addresses` retornavam `200` com a anon key — suspeita de vazamento.

**Diagnóstico:** `profiles`/`addresses` NÃO vazavam — `200 []` (array vazio) é o comportamento correto do RLS (PostgREST não retorna 403). O vazamento real estava em `orders` e `webhook_events`: as policies criadas na migration `20260408_create_orders_tables.sql` foram declaradas **sem `TO role`**, então o Postgres as aplicou ao role `PUBLIC` com `USING(true)`/`WITH CHECK(true)` — qualquer requisição com a anon key tinha leitura/escrita total. Tabelas estavam vazias (0 linhas), por isso o sintoma era `200 []`, mas exporiam tudo assim que populadas. O `service_role` (edge functions) ignora RLS por BYPASSRLS, então as policies nunca foram necessárias para ele.

**Correção (migration `20260628000000_fix_rls_orders_webhook_events.sql`, aplicada via apply_migration):**
- `orders`: dropada a policy pública; recriada SELECT-own escopada a `authenticated`.
- `webhook_events`: dropada a policy pública; deny explícito para `anon`/`authenticated`.
- `profiles`: 3 policies endurecidas de `PUBLIC` → `authenticated` (+ `WITH CHECK` no UPDATE).

**Verificação:** `set local role anon` → `orders/webhook_events/profiles/addresses` retornam 0 linhas. `get_advisors(security)` não reporta mais RLS disabled/policy pública nessas tabelas. Edge functions intactas (todas usam `SUPABASE_SERVICE_ROLE_KEY`).

**Docs:** `CLAUDE.md` ganhou seção "Segurança de RLS" (regra permanente); `fluxo-infraestrutura.md` com tabela de policies atualizada + nota da correção.

**Follow-up (pré-existente, fora do escopo, reportado pelo advisor):** funções com `search_path` mutável; `handle_new_user` e `rls_auto_enable` são `SECURITY DEFINER` executáveis por anon via RPC; proteção de senha vazada (HaveIBeenPwned) desativada no Auth.
=======
2026-06-27 (Sprint C da EAP Visibilidade de Dados — GA4 + revisão SEO/Search Console. Branch `feature/visibilidade-dados-sprint-a`. Ver sessão abaixo.)

## ▶ HANDOFF — próxima sessão (começar por aqui)

Sprints A+B+C da EAP Visibilidade de Dados **codadas e buildando**. O que falta é tudo **provisionamento manual do usuário** + QA pós-deploy. Código não tem pendência de implementação.

**1. Provisionar contas/keys (USUÁRIO — sem isso o analytics/SEO fica inerte):**
- [x] **GA4 (Sprint C):** propriedade criada, Measurement ID **`G-LS2VBNXZKE`** já no `.env` e inlined no bundle (verificado). ⚠️ **FALTA:** setar `VITE_PUBLIC_GA4_MEASUREMENT_ID=G-LS2VBNXZKE` **no hosting (Lovable)** — sem isso o build de prod não enxerga. No Data Stream do GA4, desligar pageview do Enhanced Measurement (já temos `RouteChangeTracker`, senão conta em dobro).
- [ ] **Google Search Console:** verificar `https://jilomarmitas.com` (atalho: via GA4, 1 clique, se o GA já estiver no ar) OU colar o token no meta `google-site-verification` de `index.html` (hoje `PENDENTE_*`). Depois, **submeter `sitemap.xml`**.
- [ ] **Shopify Admin token:** o `SHOPIFY_ADMIN_TOKEN` do `.env` está **inválido (401)** — gerar um novo e atualizar `.env` + hosting. Destrava o **sitemap completo** (26 produtos + kits) e o `npm run seed`. ⚠️ Conferir loja canônica: `generate-seo-files.ts` tem `jnutg9-u2` hardcoded vs `.env` `jilo-marmitas`.
- [ ] **PostHog MCP:** token novo já validado e gravado no `.mcp.json` (rodar `/mcp` se precisar reconectar). PostHog do app já valida (project key `phc_rDBm…`, projeto 487943).

**2. QA pós-provisionamento (rodar SÓ em produção, domínio `jilomarmitas.com` — gate prod-only):**
- [ ] **PostHog (B.3):** eventos no painel Activity; jornada anônimo→identificado conecta no login.
- [ ] **GA4 (C.3):** Realtime mostra pageview por rota (C.3.1); DebugView confirma os eventos-chave (C.3.2).
- [ ] **SEO:** após token Shopify válido, conferir que `sitemap.xml` lista produtos/kits; Search Console sem erros de cobertura.

**3. Encerramento da fase (Z.1):** docs `.claude/` já atualizados nesta fase (requirements R70–R77, `fluxo-analytics.md`, este `state.md`). Quando o QA passar, considerar `codebase-cleanup` se sobrar código órfão.

**4. Git:** branch `feature/visibilidade-dados-sprint-a` tem mudanças **não commitadas** (Sprint C + correções SEO + wizard PostHog anterior). Nada commitado ainda — sugerir commit(s) seguindo Git Flow (nunca em `main`/`staging`) quando o usuário pedir.

## Sessão 2026-06-27 — Sprint C (EAP Visibilidade de Dados): GA4 (aquisição & canais)

Executada a **Sprint C** de `.claude/docs/eap_visibilidade_dados.md` via `feature-builder`, mesma branch. Frontend puro — **sem banco, sem dependência nova** (gtag direto via `<script>`, sem GTM — D6). Reusa o scaffolding da Sprint B (gate `analyticsEnabled` + `maskUrl`), sequencial na sessão principal (escopo pequeno, arquivos interdependentes).

**Decisões do gate (usuário):** sanitização de nome de evento p/ o GA4 em snake_case sem acento (necessidade técnica do GA4; PostHog mantém o nome PT-BR) — **confirmada**. Measurement ID será criado depois (código inerte até lá, igual à Sprint B).

**O que mudou (tudo verificado):**
- **C.1.2** `src/analytics/ga4.ts` (NOVO) — `initGA4()` injeta o gtag prod-only e `config` com `send_page_view:false`; `trackGA4`/`pageviewGA4`. Gate `ga4Enabled = analyticsEnabled && !!VITE_PUBLIC_GA4_MEASUREMENT_ID`. Reusa `maskUrl` (exportado de `posthog.ts`). Sanitiza nome de evento.
- **C.1.3** `src/analytics/RouteChangeTracker.tsx` (NOVO) — emite `page_view` no GA4 a cada rota (`useLocation`); montado dentro do `<BrowserRouter>` em `App.tsx`. PostHog continua capturando `$pageview` sozinho.
- **C.2.1** `src/analytics/track.ts` (NOVO) — dispatcher único; `events.ts` passou a importar `track` dele → os eventos do dicionário vão p/ PostHog **e** GA4 (fan-out). 1 linha alterada em `events.ts`.
- **C.2.2** masking reusado (mesmo `maskUrl`) no `pageviewGA4` — sem duplicar.
- `src/main.tsx` — `initGA4()` ao lado do `initAnalytics()`. `.env` — `VITE_PUBLIC_GA4_MEASUREMENT_ID=` (vazio/inerte).

**Segurança/LGPD:** mesma superfície da Sprint B — gate prod-only herdado, URLs mascaradas no GA4, eventos sem PII. Sem RLS/RBAC (frontend puro) — `security-auditor` não despachado, declarado.

**Verificação:** `npm run build` ✓ (2230 módulos, sem erro de TS/Vite). Regras novas: `requirements.md` R75–R77. `fluxo-analytics.md` estendido (GA4).

### Pendências Sprint C
- **[USUÁRIO] C.1.1** — criar propriedade GA4 + Web Data Stream e setar `VITE_PUBLIC_GA4_MEASUREMENT_ID` (`G-XXXXXXX`) no `.env` e no hosting de produção. Até lá o GA4 fica inerte (no-op).
- **QA (C.3) pós-provisionamento:** Realtime do GA4 mostra pageview por rota (C.3.1); DebugView confirma os eventos-chave (C.3.2).
- **Encerramento (Z.1):** com Sprints A+B+C feitas, a fase está pronta para o fechamento de documentação (já adiantado nesta sessão e nas anteriores).

### Adendo SEO / Google Search Console (mesma sessão)
Revisão da infra de SEO a pedido do usuário. Achados + correções:
- **`package.json`** — script `seo` passou a carregar o `.env`: `tsx --env-file-if-exists=.env scripts/generate-seo-files.ts`. Antes, o `tsx` não lia o `.env`, então `SHOPIFY_ADMIN_TOKEN` ficava indefinido e o `generate-seo-files.ts` caía no fallback de rotas estáticas → sitemap com só **8 URLs** (home + cardapio + kit-livre + 5 collections), **sem os 26 produtos nem os kits**. Com a flag, o token é lido e o sitemap inclui produtos/kits — **assim que houver token válido**.
- **`index.html`** — meta `google-site-verification` saiu de comentário para tag ativa com placeholder `PENDENTE_COLAR_TOKEN_DO_GOOGLE_SEARCH_CONSOLE`. O Google ignora placeholder (sem erro). Verificação alternativa: via GA4 (mesma conta Google) sem precisar do meta.
- **🔴 Descoberta:** o `SHOPIFY_ADMIN_TOKEN` do `.env` (`shpat_53fc…`) está **inválido (HTTP 401)** nas duas lojas (`jnutg9-u2` e `jilo-marmitas`). Por isso o sitemap segue com 8 URLs mesmo após a correção. Bloqueia: sitemap completo (SEO) e o `npm run seed`/scripts Admin. **Pendência [USUÁRIO]:** gerar um Admin API token novo no Shopify e atualizar o `.env` (e o build env do hosting).
- ⚠️ Nota: o `generate-seo-files.ts` tem a loja **hardcoded** `jnutg9-u2.myshopify.com` (linha 8), divergente do `.env` (`jilo-marmitas.myshopify.com`). Confirmar a loja canônica ao trocar o token.

### Pendências SEO / Google
- **[USUÁRIO]** Verificar o domínio no **Google Search Console** (`https://jilomarmitas.com`) e colar o token no meta de `index.html` — OU verificar via GA4.
- **[USUÁRIO]** Submeter `https://jilomarmitas.com/sitemap.xml` no Search Console após verificar.
- **[USUÁRIO]** Gerar Admin token Shopify válido p/ o sitemap pegar os produtos/kits.

## Sessão 2026-06-27 — Sprint B (EAP Visibilidade de Dados): PostHog (instrumentação de produto)

Executada a **Sprint B** de `.claude/docs/eap_visibilidade_dados.md` via `feature-builder`, na branch `feature/visibilidade-dados-sprint-a` (mesma branch acumula todas as sprints da fase). Frontend puro — **sem banco/migration**. Fundação + AuthContext feitos na sessão principal; instrumentação dos call-sites por 2 `feature-coder` em paralelo (file-disjuntos).

**Decisões do gate (usuário):** domínio prod = `jilomarmitas.com`; env vars fiadas no código, usuário preenche depois (analytics inerte até lá).

**O que mudou (tudo verificado):**
- **B.1 Fundação:** `posthog-js` + `@posthog/react` instalados. `src/analytics/posthog.ts` (init + gate prod-only `analyticsEnabled` + masking de PII via `before_send` + helpers `track`/`identifyUser`/`resetAnalytics`). `src/analytics/events.ts` (8 eventos tipados, sem PII). `src/main.tsx` (`initAnalytics()` + `<PostHogProvider client={posthog}>`).
- **B.2 Identify + eventos:** `AuthContext.tsx` — `identify(user.id)` no SIGNED_IN + restauração de sessão, `reset()` no SIGNED_OUT, eventos `login efetuado`/`cadastro concluído` (resolveu o comentário de coordenação da Seção 6). Instrumentação dos 8 eventos nos chokepoints: `cartStore` (item adicionado + kit montado), `Carrinho` (carrinho aberto + checkout iniciado), `CartDrawer` (carrinho aberto), `Product` (produto visualizado + checkout buy-now), `useAddresses` (endereço cadastrado).

**Segurança/LGPD:** gate prod-only (`!!KEY && PROD && hostname ∈ jilomarmitas.com`); identify só por `user.id` (sem email/CPF); masking de `/conta/pedidos/:id` e UUIDs no `before_send`; eventos sem PII; key via env (não hardcoded). Sem superfície de RLS/RBAC (frontend puro) — `security-auditor` não despachado, declarado.

**Verificação:** `tsc --noEmit` exit 0 · `npx vite build` ✓ (2227 módulos) · `vitest` 1/1. Regras novas: `requirements.md` R70–R74. Novo doc: `fluxo-analytics.md` (registrado no CLAUDE.md).

### Pendências Sprint B
- **[USUÁRIO] B.1.1** — criar o projeto PostHog e setar `VITE_PUBLIC_POSTHOG_KEY` + `VITE_PUBLIC_POSTHOG_HOST` no hosting de produção. Até lá o analytics fica inerte (no-op).
- **QA (B.3) pós-provisionamento:** confirmar eventos no painel PostHog (Activity) em prod (B.3.1) e jornada anônimo→identificado conectando no login (B.3.2). Validar que dev/preview NÃO emitem (gate).
- **Sprint C (GA4)** entra depois, reusando este scaffolding (gate + masking + dicionário de eventos).

## Sessão 2026-06-26 — Sprint A (EAP Visibilidade de Dados): Captação Shopify

Executada a **Sprint A** de `.claude/docs/eap_visibilidade_dados.md` (cliente + endereço + pedidos), com foco em segurança/LGPD, via `feature-builder` (3 subagentes em paralelo para edição + deploys/backfill no main). MCP Shopify autenticado no Claude Desktop usado para backfill (loja "Jilo Marmitas", `jnutg9-u2`).

**Decisões do gate (usuário):** webhooks via edge function com trigger pelo usuário; `order_items` incluído; backfill feito agora.

**O que mudou (código, tudo deployado e verificado):**
- **A.1.1** `supabase/functions/shopify-customer-sync/index.ts` — passou a anexar o **endereço default nativo** ao customer via mutation SEPARADA `customerAddressCreate` (`CustomerInput` não tem campo `addresses` na API 2025-10). FAIL-SOFT: erro de endereço nunca bloqueia o sync. Endereço vem da tabela `addresses` (default), não das colunas `profiles.*` (que estão vazias). Bairro → `address2`; `provinceCode`=UF; `countryCode`=BR. **CPF nunca é enviado** (D2/LGPD). Fallback de nome via `user_metadata.full_name` quando o profile ainda está vazio (signup). Deploy v25 (verify_jwt: true).
- **A.1.2** `src/contexts/AuthContext.tsx` — dispara `shopify-customer-sync` no evento `SIGNED_IN` (signup E login), deferido com `setTimeout(…,0)` p/ evitar deadlock do `onAuthStateChange`. Idempotente (a edge retorna `already_synced`). Comentário marca onde a Sprint B (PostHog) entra no mesmo handler (EAP Seção 6).
- **A.2.2** `supabase/functions/shopify-webhook-receiver/index.ts` — `orders/paid` virou **upsert defensivo** (`extractOrderData(payload)` + campos de pagamento): se `paid` chegar antes de `create`, a linha é criada em vez de perdida.
- **A.2.3** mesmo arquivo — popula `order_items` normalizado (`extractOrderItems`/`syncOrderItems`, delete-then-insert por `order_id`) no `orders/create` e no `orders/paid`, filtrando a variant fantasma de frete. Deploy v26 (verify_jwt: false).
- **A.2.1** `supabase/functions/register-shopify-webhooks/index.ts` (**NOVO**) — registra idempotentemente os webhooks `ORDERS_CREATE/PAID/FULFILLED` apontando p/ o receiver, usando o **app custom** (OAuth client_credentials inline) p/ o HMAC bater com `SHOPIFY_WEBHOOK_SECRET`. Guard: `Authorization: Bearer <SERVICE_ROLE_KEY>`. Deploy v1 (verify_jwt: false). **Disparo é manual (usuário)** — ver pendência.

**Backfill (A.3.3):** os 6 profiles órfãos agora têm `shopify_customer_id` (6/6). 4 customers criados via MCP (Julia/Fainow/Darlison/Luiz); 2 (marbergertony/enzosimoes) **já existiam do checkout** — receberam as tags `jilo-customer`/`source:supabase` e já tinham endereço. Endereço nativo anexado aos 3 novos com endereço no Supabase (Julia não tem; os 2 existentes mantiveram o endereço do checkout).

**Descoberta importante (HMAC):** o MCP Shopify do Claude Desktop roda sob o app **"Shopify Claude Connector App"** (apiKey `bff99d…`), DIFERENTE do app custom. Registrar webhooks por ele assinaria o HMAC com o segredo errado → 401 no receiver. Por isso A.2.1 usa o app custom. (O Connector App também roda uma API mais antiga — rejeitou o arg `identifier` do `customerCreate`.)

**Verificação:** `tsc --noEmit` exit 0 · `vitest` 1/1 · conteúdo deployado conferido byte-a-byte contra o disco (get_edge_function) · `register-shopify-webhooks`/`shopify-webhook-receiver`/`shopify-customer-sync` todos ACTIVE. **Sem migration** (todas as tabelas/colunas já existiam).

### Pendências Sprint A
- **[USUÁRIO] Disparar o registro dos webhooks** (A.2.1) — ver comando entregue na sessão. Enquanto não rodar, `orders`/`webhook_events` seguem vazias (nenhum pedido é capturado). Após disparar: fazer 1 pedido de teste e confirmar linha em `webhook_events` (processed=true) + `orders` + `order_items` (A.3.1).
- **[USUÁRIO] Confirmar que `SHOPIFY_WEBHOOK_SECRET` == client secret do app custom** — se divergir, o receiver retorna 401 em todo webhook (mitigação: validar com o pedido de teste).
- **Backlog (fora do escopo estrito da Sprint A):** (1) endereço adicionado DEPOIS do customer já existir não é re-enviado (sync idempotente por `shopify_customer_id`); (2) o webhook não preenche `orders.user_id` (RLS esconde o pedido do cliente em `/conta/pedidos`) — linkar por `customer_email`→`profiles` numa próxima passada.


## Sessão 2026-06-22 — Fix discrepância de desconto dos kits (frontend × Shopify)

**Bug:** páginas de kit (Leveza/Sabor/Força/Verde) e Kit Livre anunciavam 7→10%, 14→15%, 21→20%, 28→25%, mas o carrinho aplicava 7→5%, 14→10%, 21→15%, 28→20%. Cliente via "−10%" na página e recebia só "−5%" no carrinho (label "Kit 7 – 5% off").

**Causa-raiz (confirmada via Shopify Admin API MCP, loja live "Jilo Marmitas" / checkout.jilomarmitas.com):** os 4 Automatic Discounts ATIVOS são 5/10/15/20 (a planilha oficial) — nodes 1321712844940 (5%), 1321712910476 (10%), 1321713074316 (15%), 1321713139852 (20%). O frontend tinha `KIT_SIZES`/`KIT_TIERS` hardcoded em 10/15/20/25 e a doc `fluxo-kits.md` documentava 10/15/20/25 (errado). Duas fontes de verdade divergentes.

**Decisão de negócio validada (gate feature-builder):** escala oficial = 5/10/15/20. Alinhar o FRONTEND à planilha (baixar o anunciado), NÃO mexer no Shopify. Sem impacto de margem; cliente passa a ver o desconto real.

**Correção (só código + docs, nenhuma mutation no Shopify):**
- `src/pages/Kit.tsx` — `KIT_SIZES` discounts 10/15/20/25 → 5/10/15/20.
- `src/pages/KitLivre.tsx` — `KIT_TIERS` 10/15/20/25 → 5/10/15/20; SEO "até 25%" → "até 20%".
- `src/components/sections/WeeklyKits.tsx` — "a partir de" `× 0.90` → `× 0.95` (5% = menor tier).

**Docs atualizados:** `fluxo-kits.md` (tabela de Automatic Discounts + labels + saturação 20%); `fluxo-carrinho-checkout.md` (cenário de QA recomputado: Kit 7 −5% → base R$ 178,88; PIX5 −5% → R$ 169,94); `requirements.md` R61 (exemplos kit 7/28 → 5%/20%); esta entrada.

**⚠️ Correção das sessões anteriores:** as entradas da Sprint 5.2 (abaixo, 2026-06-15) usavam a premissa "kit 7 = 10% → R$ 169,47 → PIX 3% → R$ 164,39" — factualmente errada (o Shopify sempre aplicou 5%). Números de referência corretos: 7 pratos, subtotal R$ 188,30 → Kit 7 −5% = −R$ 9,42 → base R$ 178,88 → PIX5 −5% → R$ 169,94.

**Verificação:** `npx tsc --noEmit` exit 0; `vitest run` 1/1 passou.

### Pendências
- **QA manual:** abrir `/kit/kit-leveza` (e demais), conferir o selector mostrando −5/−10/−15/−20%; montar kit de 7 → carrinho deve bater com o anunciado ("Kit 7 – 5% off").
- Tiers seguem hardcoded em 2 lugares (`KIT_SIZES`, `KIT_TIERS`) + `WeeklyKits` — nada impede frontend e Shopify de divergirem de novo. Backlog: fonte única (ou ler do Shopify).


## Sessão 2026-06-22 (Uber pickup) — Correção do endereço de coleta da Uber Direct

**Demanda:** corrigir o endereço de coleta usado nas chamadas à API Uber Direct, usando o endereço do `CNPJ JILÓ.pdf` como fonte de verdade.

**Endereço correto (CNPJ JILO ALIMENTACAO LTDA, 05.574.020/0001-90):** Av. Engenheiro Juarez de Siqueira Britto Wanderley, 50 – Loja 05, Eldorado, São José dos Campos/SP, CEP 12238-565.

**Onde mora a config (achado):** o endereço de coleta NÃO está em tabela — está em **Edge Function Secrets** (`JILO_PICKUP_ADDRESS_JSON`, `JILO_PICKUP_LATITUDE`, `JILO_PICKUP_LONGITUDE`, `JILO_PICKUP_NAME`, `JILO_PICKUP_PHONE`), lido por `Deno.env.get(...)` (sem fallback) em `uber-quote` e `uber-create-delivery`. O MCP do Supabase NÃO escreve secrets (sem ferramenta) e `execute_sql` não alcança — então a correção é feita pelo Dashboard/CLI, pelo usuário. Decisão validada com o usuário (gate): manter em secrets, usuário seta.

**Valores corretos entregues ao usuário p/ setar (projeto `hofohxvizlmawgkinwwz`):**
- `JILO_PICKUP_ADDRESS_JSON` = `{"street_address":["Avenida Engenheiro Juarez de Siqueira Britto Wanderley, 50","Loja 05"],"city":"São José dos Campos","state":"SP","zip_code":"12238565","country":"BR"}`
- `JILO_PICKUP_LATITUDE` = `-23.2625966` / `JILO_PICKUP_LONGITUDE` = `-45.9155005` (geocode Nominatim+web, eixo da avenida).

**Docs:** `fluxo-uber-direct.md` (tabela "Pickup Jilo" agora traz os valores reais + nota de que são secrets não-graváveis por MCP); esta entrada.

**✅ Verificado (2026-06-22):** usuário atualizou os secrets pelo Dashboard. Testei a `uber-quote` ao vivo (cold start já aplicou o novo valor — sem redeploy): destino longe (Colinas Shopping, Av. São João 2200) → `address_undeliverable` com distância calculada 4,09 mi (>5 km); destino perto (Av. Cassiano Ricardo 601, Jardim Aquarius) → **200, fee R$ 21,90, quote_id `dqt_…`**. As distâncias batem com o novo pickup (Eldorado/Jardim Aquarius). Integração funcional.

### Pendências
- **Confirmar pino exato do nº 50** no Google Maps antes de produção (o geocode é o eixo da avenida; a Uber coleta na coordenada).
- **Usuário: revogar o Personal Access Token** colado no chat (`sbp_…`) em supabase.com/dashboard/account/tokens.
- Obs.: o MCP `get_logs` só retorna logs de acesso (200/502), não a linha `console.log` do payload — a confirmação foi comportamental (auth + cálculo de raio a partir do pickup), não byte-a-byte do `pickup_address`.


## Sessão 2026-06-22 (4.1 + 4.2) — Arredondamento do desconto + "a partir de" da home

**4.1 — Regra de arredondamento (DECISÃO, sem mudança de código):** o desconto de kit exibido (ex.: kit 7 = −R$ 6,93) é a alocação REAL do Shopify, lida em `cartStore.refreshCartDetails` das `line.discountAllocations[].discountedAmount` (não é calculado no frontend). O Shopify arredonda 5% por unidade para baixo (R$ 19,98 × 5% = R$ 0,999 → R$ 0,99 × 7 = R$ 6,93), vs R$ 6,99 dos 5% exatos. **Decisão validada com o usuário (gate):** MANTER o valor real (vitrine == checkout); não recalcular no frontend (recálculo reintroduziria a divergência das Inconsistências 1/2). Regra documentada em `fluxo-kits.md` (regra #4). A diferença (centavos, a favor da loja) é aceita.

**4.2 — "A partir de" da home (FIX de código):** os cards do `WeeklyKits.tsx` mostravam o preço/un de um tier intermediário (antes 10%, depois 5% após o fix da Inconsistência 1) — não o mínimo real. Corrigido para usar o **maior desconto** (kit de 28 = 20% off): fator `× 0.95` → `× 0.80`. Agora "a partir de" reflete o menor preço/un atingível: G1 R$ 15,98, G2 R$ 16,79, G3/G4 R$ 21,52 (confere com os valores do usuário). Kit Livre (menor preço entre kits) acompanha automaticamente.

**Verificação:** `npx tsc --noEmit` exit 0; `vitest run` 1/1.

**Docs:** `fluxo-kits.md` (regra #4 — arredondamento; regra #5 — fator do WeeklyKits); esta entrada.

### Pendências
- **QA visual:** home → cards "a partir de" devem mostrar R$ 15,98 (Leveza) / R$ 16,79 (Sabor) / R$ 21,52 (Força/Verde). Carrinho de 7 → desconto −R$ 6,93 (real do Shopify), batendo com o checkout.


## Sessão 2026-06-22 (Inconsistência 2) — Mini-carrinho não aplicava o desconto no total

**Bug (reproduzido ao vivo):** no `CartDrawer` (drawer lateral), a linha de desconto de kit aparecia, mas o "Total estimado" e o botão "Finalizar Compra" exibiam o SUBTOTAL CHEIO. Ex.: 7 pratos R$ 139,86, "Kit 7 – 5% off" −R$ 6,93 → drawer mostrava R$ 139,86 (errado); /carrinho mostrava R$ 132,93 (correto).

**Causa-raiz:** `CartDrawer.tsx` calculava `subtotal` cru e renderizava a linha de `cartDiscountAllocations`, mas os dois totais (l.221 "Total estimado" e l.238 botão) usavam `subtotal.toFixed(2)` direto — nunca subtraíam o desconto. O cálculo correto já existia em `Carrinho.tsx` (`kitDiscountTotal` → `displayTotal`). Defeito isolado no componente do drawer.

**Correção (cirúrgica, só `src/components/CartDrawer.tsx`):**
- Novo `kitDiscountTotal = Σ cartDiscountAllocations[].discountedAmount` e `totalWithDiscount = subtotal − kitDiscountTotal` (espelha Carrinho.tsx).
- "Total estimado" e botão "Finalizar Compra" passam a usar `totalWithDiscount`.
- Linha de desconto agora mapeia TODAS as allocations (`.map`) em vez de só `[0]`, garantindo que o total nunca divirja das linhas exibidas.
- Drawer NÃO inclui frete no total (mostrado à parte) — "Total estimado" = produtos com desconto, consistente com a UX do mini-cart.

**Verificação:** `npx tsc --noEmit` exit 0; `vitest run` 1/1.

**Docs:** `fluxo-carrinho-checkout.md` (seção CartDrawer + cenário de QA do total do drawer); esta entrada.

### Pendências
- **QA visual:** adicionar 7 marmitas, abrir o drawer → "Total estimado" e botão devem mostrar subtotal − desconto (ex.: R$ 132,93), batendo com o /carrinho.
- Formatação: o drawer usa `.toFixed(2)` (ponto) nos totais enquanto /carrinho usa vírgula (`.replace(".", ",")`) — inconsistência de formato pré-existente, NÃO tocada neste fix. Backlog se quiser padronizar.


## Sessão 2026-06-15 — Fix combinabilidade PIX × Kit (branch fix/checkout-pix)

**Bug:** com ≥7 marmitas (kit ativo), selecionar PIX no `PaymentMethodSelector` falhava — log `[PaymentMethodSelector] PIX coupon não aplicável { attemptedCode: 'PIX3', totalNonShippingItems: 7, shopifyResult: { success: true, applicable: false } }`. PIX5 (<7) funcionava normal.

**Causa-raiz (confirmada via Admin API):** `PIX3` e os Kits eram AMBOS da classe `PRODUCT` (`DiscountProducts`) sobre as mesmas marmitas. Na **Shopify Basic**, só UM desconto de produto aplica por linha de carrinho (empilhar dois product discounts na mesma linha exige `productDiscountsWithTagsOnSameCartLine`, exclusivo do **Plus**). O Kit (automático) ocupava a linha → o Storefront Cart API recusava o `PIX3` com `applicable: false`. As flags `combinesWith.productDiscounts: true` não resolvem — só permitem product+product em linhas DIFERENTES. Frontend estava correto; bug era 100% de configuração no Shopify Admin.

**Correção (aplicada via Admin API MCP nesta sessão, loja live `jnutg9-u2`):**
- `PIX3` recriado como **desconto de PEDIDO** (classe `ORDER`, `customerGets.items: { all: true }`, 3%, `combinesWith.productDiscounts: true`). Mesmo código `"PIX3"` — transparente pro frontend. O `PIX3` antigo (PRODUCT, node `1332035321996`) foi DELETADO; novo node `1342820876428`.
- Os 4 Kits (`Kit 7/14/21/28`) tiveram `combinesWith.orderDiscounts` alterado de `false` → `true` (combinabilidade bidirecional). Nodes: 1321712844940, 1321712910476, 1321713074316, 1321713139852.
- `PIX5` (<7) **inalterado** — classe `PRODUCT`, sem kit ativo abaixo de 7.

**Decisões de negócio validadas (gate feature-planner):**
- Empilhamento PIX+Kit confirmado: kit 7 = 10%+3% ≈ 12,7%; kit 28 = 25%+3% ≈ 27,25% (PIX incide sobre subtotal já com kit).
- Recriar PIX3 (vs editar in-place) — perdeu histórico de uso do cupom antigo (uso baixo, criado abr/2026).

**Código:** NENHUMA mudança de runtime. `pixCoupons.ts` e `PaymentMethodSelector.tsx` referenciam o código, não a classe.

**Docs atualizados:** R19 corrigida + nova R61 em `requirements.md`; tabela de constantes + regra #9 + gotcha PIX em `fluxo-carrinho-checkout.md`; esta entrada.

### Pendências
- **QA manual (validação E2E do fix):** carrinho de 7 marmitas + selecionar PIX → deve aplicar sem erro. Total esperado 7×R$26,90: subtotal R$188,30 → kit 10% → R$169,47 → PIX 3% → **R$164,39** (desconto efetivo só visível no checkout nativo Shopify, por R53/R60). Testar também 14/21/28.
- **Efeito colateral monitorar:** Kits agora combinam com QUALQUER order discount futuro. Cupom manual "Amount off order" empilhará automaticamente — se não desejado, criar com `combinesWith.orderDiscounts: false`.
- **`fluxo-kits.md`:** não editado nesta sessão — se mencionar combinabilidade do Kit, alinhar com R61 numa próxima passada.


## O que foi feito no merge (consolidação Sprint 5.1, 2026-06-15)

Duas linhas de trabalho rotuladas "Sprint 5.1" divergiram entre `main` e `fi` e foram integradas. O código mesclado contém AMBAS:

- **Da `main` (R56–R59):** kit em múltiplos de 7 (`src/config/kitQuantity.ts`), PIX efêmero reconciliado no load (`reconcileDiscountsOnLoad` + `src/config/pixCoupons.ts`), frete grátis blindado na transição, e o hard-block do checkout validando a PRESENÇA da linha de frete (`shopifyHasShippingLine`) em vez de comparar subtotais — imune a descontos. Detalhes nas seções abaixo ("Sprint 5.1" + "Correções pós-Sprint 5.1").
- **Da `fi` (R60 — desconto de kit visível):** `cartStore.refreshCartDetails()` agrega `line.discountAllocations` (o desconto de kit é `DiscountProducts`, aloca por linha, nunca em `cart.discountAllocations`) e popula `cartDiscountAllocations`; `Carrinho.tsx` exibe a linha verde de desconto, usa `displayTotal = (subtotal - kitDiscountTotal) + frete`, e passa a base já com desconto ao PIX (`subtotalCents={Math.round((subtotal - kitDiscountTotal) * 100)}`).

**Conflitos resolvidos no merge:**
- `src/stores/cartStore.ts` (`refreshCartDetails`): COMBINADO — a agregação de allocations (fi) E o `shopifyHasShippingLine` (main) coexistem no mesmo `set`.
- `src/pages/Carrinho.tsx`: mantém `kitDiscountTotal`/`productsTotalWithDiscount`/`displayTotal` com desconto (fi) e adota o `canCheckout` por `freightStateOk` + `isQuantityValid` (main, R59/R56). O antigo `totalMatchesShopify`/`expectedTotal`/`shopifySubtotal` (fi) foi **DESCARTADO** — substituído pela R59, que já é imune a descontos (resolve também o display do kit sem precisar da aritmética de subtotal).
- Docs: minha regra de agregação foi renumerada **R56→R60** (a `main` já usava R56–R59); `fluxo-carrinho-checkout.md` integra ambos os conjuntos; `fluxo-kits.md` traz a nota de agregação por linha.

### Pendências / Notas (pós-merge)

- **QA manual consolidado:** faixas 6 (pago) / 7,14,28 (grátis, libera) / 8 (kit inválido, trava com nudge) / transição 6↔7 observando o botão; reabrir o site com PIX de sessão anterior (deve sumir) e com cupom manual (deve ficar); kit de 7/14/21/28 → linha verde de desconto + TOTAL com desconto + checkout liberado.
- **Bug PIX no hard-block:** resolvido pela R59 (eliminou a comparação de subtotais) — confirmar no QA acima.
- **Débitos herdados ainda abertos:** edge `set-product-unlisted` obsoleta/perigosa (Sprint 5.0), HMAC `uber-webhook-receiver`, validação server-side de `shipping_fee_cents`, `PixCallout` estático "5% off". Encoding mojibake na seção Sprint 5.0 deste `state.md` (herdado da `main`) — corrigir quando reescrever a seção.

## Última sessão (Sprint 5.1 — kit múltiplo de 7 + frete grátis + PIX efêmero)
- R56: a partir de 7 marmitas só múltiplos de 7. Soft-block com gate único no canCheckout. Aviso acionável (botão "Adicionar mais N" → /kit-livre).
- R57: PIX (PIX3/PIX5) nunca grudento — reconcileDiscountsOnLoad remove no load, manuais (100teste) sobrevivem.
- R58: transição pra frete grátis blindada — remoção robusta da variant fantasma + "Atualizando frete grátis…".
- Criados: src/config/kitQuantity.ts, src/config/pixCoupons.ts, src/components/KitQuantityNotice.tsx.
- Editados: cartStore.ts, ShippingMethodSelector.tsx, Carrinho.tsx, CartDrawer.tsx, KitLivre.tsx, PaymentMethodSelector.tsx (refactor de import).
- 0 migrations, 0 edge functions. Loja confirmada: PIX5/PIX3 ACTIVE, 100teste manual; variant fantasma ACTIVE; kits 7/14/21/28 (teto 25%).

### Pendências
- QA manual: faixas 6/7/8/13/14/28/35 no carrinho e KitLivre; reabrir o site com PIX de sessão anterior (deve sumir) e com cupom manual (deve ficar); transição 6→7 observando o frete.
- Bug aberto do PIX no hard-block (pré-existente) segue fora de escopo. (Resolvido depois pela R59 — ver Correções pós-Sprint 5.1 abaixo.)

## Correções pós-Sprint 5.1
- Encoding: PaymentMethodSelector.tsx havia sido salvo com mojibake (UTF-8 lido como Latin-1) + BOM. Reescrito em UTF-8 correto. Causa provável: locale do ambiente que gravou o arquivo. Conferir LANG/LC_ALL ao gerar arquivos com acento.
- Checkout travado em ≥7 (R59): hard-block passou a checar presença da linha de frete (shopifyHasShippingLine) em vez de comparar subtotais — descontos de Kit (DiscountProducts) reduzem o subtotalAmount e quebravam o totalMatchesShopify. Editados: cartStore.ts (refreshCartDetails) e Carrinho.tsx.

### Pendência
- QA: 6 (pago), 7/14/28 (grátis, deve liberar), 8 (kit inválido, deve travar com nudge), transição 6↔️7 observando o estado do botão.

## O que foi feito na última sessão (Sprint 5.0 — Publicação no sales channel + status ACTIVE + filtro de catálogo)

> ⚠️ Correção de rumo: a hipótese inicial desta sprint (status `UNLISTED` resolve o bug) foi **testada empiricamente e refutada** via Playwright + Storefront/Admin API. O que segue é o diagnóstico verificado.

- **Bug raiz verificado (não era status):** o produto fantasma "Frete Uber Direct" (`gid://shopify/Product/9213544136844`, variant `48168478769292` — bate com o `.env`) estava publicado **apenas no sales channel "Point of Sale"**, NÃO no "Online Store". O token Storefront do frontend lê do canal Online Store. Em Shopify, disponibilidade via Storefront = **publicação no sales channel do token**, ortogonal ao status do produto. Por isso o `cartLinesAdd` da variant retornava erro explícito "A mercadoria … não existe" e o `node()` retornava `null` → a linha nunca entrava no Cart → hard-block do checkout sempre travado em "Sincronizando frete...".
- **UNLISTED NÃO funciona nesta loja (refutado):** depois de publicar o produto no Online Store mantendo `status: UNLISTED`, a variant continuou retornando `node: null` na Storefront em **todas as versões testadas (2025-07, 2025-10, 2025-01, unstable)** ao longo de vários minutos. Só ao mudar para `status: ACTIVE` (já publicado no Online Store) é que `availableForSale: true` e `cartLinesAdd` passaram a funcionar — verificado de ponta a ponta no `/carrinho` (botão "Ir para o Checkout" liberou, TOTAL R$ 29,44). NOTA: não foi feito o teste reverso limpo (ACTIVE→UNLISTED após propagação), então o fato verificado é "UNLISTED+publicado retornou null nos nossos testes", não "UNLISTED é impossível em qualquer cenário".
- **Correção aplicada (fix completo, escolhido pelo usuário):**
  - **Shopify (via Admin GraphQL):** produto fantasma `publishablePublish` no Online Store + `status: ACTIVE`.
  - **Código — filtro de catálogo:** como ACTIVE faz o produto aparecer em listagens (as queries `PRODUCTS_QUERY` não filtravam a tag), foi adicionado o helper `excludeInternalShipping(query?)` em `src/lib/shopify.ts` e aplicado em TODOS os call sites de catálogo (`AllDishes`, `FullMenu`, `Favorites` (2x), `KitLivre`, `Carrinho` sugestões, `Product` relacionados, `Collection`). Verificado: cardápio voltou de 27 → 26 pratos, "Frete Uber Direct" não vaza. A filtragem visual de `__internal_shipping` no carrinho (Carrinho/CartDrawer) continua valendo.
  - **`cartStore.ts` — validação pós-add (R55):** mantida como defesa em profundidade (após `addLineToShopifyCart` com sucesso para a variant fantasma, confirma via `fetchCartFull` que a linha entrou). Útil pra detectar regressões de publicação/status. (Os comentários internos que diziam "produto é unlisted" foram corrigidos pra "ACTIVE + publicado".)
- **O que NÃO mudou:** hard-block `canCheckout` (R52, Sprint 4.9), display local (R53), OAuth Client Credentials (R51), REPLACE atômico (R50), memoização (Sprint 4.6) — todos intactos.
- **Regras:** R54 (status ACTIVE + publicado no Online Store; UNLISTED não serve) e R55 (validação pós-add) em `requirements.md` — **reescritas** pra refletir a realidade verificada.
- **Arquivos editados:**
  - `src/lib/shopify.ts` (helper `excludeInternalShipping` + `INTERNAL_SHIPPING_TAG`)
  - `src/pages/{Carrinho,Product,Collection,KitLivre}.tsx` e `src/components/sections/{AllDishes,FullMenu,Favorites}.tsx` (filtro nas queries de catálogo)
  - `src/stores/cartStore.ts` (validação pós-add R55, da sessão anterior)
  - Shopify: produto `9213544136844` → ACTIVE + publicado no Online Store (via Admin API)

### Pendências / Notas para a próxima sessão

- **⚠️ A edge `set-product-unlisted` está OBSOLETA e é PERIGOSA:** ela seta `UNLISTED`, que **re-quebra o carrinho** (a variant some da Storefront). NÃO rodar. Decisão pendente do usuário: deletar a edge OU repropô-la como "set ACTIVE + publishablePublish(Online Store)" — que é o que um ambiente novo (staging) realmente precisa. A entrada em `supabase/config.toml` continua lá.
- **Estado do produto fantasma a manter:** `status: ACTIVE` + publicado no **Online Store** (e Point of Sale). Conferir via Admin se algum dia o checkout voltar a travar em "Sincronizando frete...".
- **🐛 BUG ABERTO descoberto nesta sessão — PIX trava o checkout:** ao selecionar PIX no `/carrinho`, o `PaymentMethodSelector` aplica o cupom `PIX5` no Shopify Cart (`applyDiscountCode`), que reduz o `subtotalAmount` do Shopify (`18.94 × 0.95 + 10.50 ≈ 28.5`). O hard-block (`Carrinho.tsx:86-90`) compara esse `shopifySubtotal` (já descontado) contra o `expectedTotal` SEM desconto (29.44) → diff ≈ R$ 0,94 → `canCheckout = false` → botão trava em "Sincronizando frete...". Voltar pra Cartão de Crédito libera. **Bug pré-existente da lógica do hard-block (R52 revisado, Sprint 4.9)** — estava mascarado porque a variant nunca entrava no Cart (o block sempre travava no caso "linha ausente", diff −10,50). Agora que a linha entra, o caso PIX ficou visível. Correção exige ajustar o `totalMatchesShopify` pra considerar desconto de cupom (comparar contra `totalAmount` quando há cupom aplicado, ou subtrair o desconto do `expectedTotal`) SEM enfraquecer a proteção contra frete-ausente. NÃO corrigido nesta sessão (fora do escopo do fix de frete).
- **Validação manual ainda pendente (usuário):** click-through real até o checkout Shopify (cobrança produtos + frete + Getnet). Spot-check de Favorites/KitLivre (mesmo helper, build passou).
- **Edge de diagnóstico `shopify-admin-diag`:** foi deployada durante a investigação e **neutralizada** (no-op, `verify_jwt=true`, retorna 410). Deletar via `supabase functions delete shopify-admin-diag`.
- **Débitos de segurança ainda abertos:** HMAC no `uber-webhook-receiver`, validação server-side de `shipping_fee_cents` (inalterados).

## O que foi feito na sessão anterior (Sprint 4.8 — TOTAL local no carrinho)

- **Bug corrigido:** o TOTAL na página `/carrinho` exibia valor errado (ex: R$ 18,00 quando subtotal R$ 18,94 + frete R$ 10,50 deveria dar R$ 29,44). Causa: `displayTotal` lia `cartCost.totalAmount` do Shopify, que não inclui o frete (variant fantasma não garantida no Cart) E já vem com o desconto do cupom aplicado (R$ 18,94 − 5% PIX5 = R$ 18,00).
- **Causa raiz conceitual:** o display estava acoplado ao Shopify Cart, quando deveria ser somatória local. O frontend já tem `subtotal` e `activeShippingFeeCents` no estado — não precisa do Shopify pra calcular o que exibe.
- **Solução:** `displayTotal = subtotal + activeShippingFeeCents / 100` (somatória local). 1 linha em `src/pages/Carrinho.tsx`. Sem desconto no display (decisão de negócio — desconto aparece só no checkout Shopify, como a UI já comunica).
- **Separação display vs cobrança:** o display virou local. A COBRANÇA do frete continua dependendo da variant fantasma no Shopify Cart (checkout nativo Shopify) — isso NÃO foi alterado, continua sendo trabalho do `<ShippingMethodSelector />` (Sprint 4.1+) e protegido pelo hard-block do `canCheckout` (R52, Sprint 4.7). O `shopifyTotal` continua existindo só para o `totalMatchesShopify`.
- **Arquivos editados:** `src/pages/Carrinho.tsx` (1 linha — `displayTotal`). 0 migrations, 0 edge functions, 0 mudanças no `cartStore`, 0 mudanças no `ShippingMethodSelector`.
- **Regra adicionada:** R53 em `requirements.md` (TOTAL local).
- **Documentação atualizada:** `fluxo-carrinho-checkout.md` (regra + gotcha sobre display vs cobrança).

### Notas para a próxima sessão

- **Display ≠ cobrança (importante):** o `displayTotal` é puramente visual e local. A cobrança real acontece no checkout Shopify, que depende da variant fantasma estar no Cart + descontos configurados no Shopify Admin. Não confundir: mexer no `displayTotal` não muda o que a Shopify cobra, e mexer na variant fantasma não muda o que a página exibe.
- **Por que o desconto não aparece no display:** decisão de negócio (Sprint 4.8). A UI já comunica "Descontos aplicados no checkout Shopify". Se no futuro quiserem mostrar o desconto na página também, dá pra calcular `cartCost.subtotalAmount - cartCost.totalAmount` e subtrair do display — mas isso foi explicitamente descartado nessa sprint.
- **O custom checkout com Getnet (planejado) muda esse jogo:** quando o checkout sair do Shopify e for próprio (Getnet), tanto o display quanto a cobrança passam a ser controlados pelo frontend/backend Jilo. Aí a variant fantasma deixa de ser necessária e o `displayTotal` local vira a fonte de verdade tanto pra exibição quanto pra cobrança. Reavaliar toda essa arquitetura quando o custom checkout entrar no roadmap.

## O que foi feito na sessão anterior (Sprint 4.7 — OAuth Client Credentials)

- **Bug raiz corrigido:** o `SHOPIFY_ADMIN_ACCESS_TOKEN` estático estava expirado/inválido em produção (HTTP 401 "Invalid API key or access token"). A Shopify migrou pro Dev Dashboard novo (Dec 2025) e deprecou a entrega direta de `shpat_` permanente. Agora, o `shpat_` é gerado dinamicamente via OAuth 2.0 Client Credentials Grant, e expira em 24h.
- **Sintoma na produção:** edge `update-shipping-variant-price` retornava 502 em 100% das chamadas. Variant fantasma de frete nunca entrava no Shopify Cart. TOTAL no `/carrinho` exibia só subtotal (sem somar frete). Em paralelo, `shopify-customer-sync` também falhava silenciosamente — clientes novos não sincronizavam no Shopify.
- **Solução (3 tracks paralelas + docs):**
  - **Track A — Backend OAuth (4 prompts sequenciais):**
    - Migration nova: `shopify_admin_tokens` (cache de `shpat_` com TTL, RLS bloqueada, service_role-only)
    - Helper compartilhado: `supabase/functions/_shared/shopify-admin-auth.ts` (Client Credentials Grant + read/write cache + force refresh em 401)
    - Refatorada `update-shipping-variant-price` para usar o helper (com retry automático em 401)
    - Refatorada `shopify-customer-sync` para usar o helper (mesmo padrão)
  - **Track B — Frontend hard-block (1 prompt):**
    - `canCheckout` em `src/pages/Carrinho.tsx` agora valida `Math.abs(shopifyTotal - (subtotal + activeShippingFeeCents/100)) < 0.01`
    - Botão exibe "Sincronizando frete..." e fica disabled em discrepância
    - `console.warn` defensivo com payload pra diagnóstico
  - **Track C — Operacional (manual):**
    - Rotacionado client_secret no Dev Dashboard
    - Cadastrados `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET` nos Edge Function Secrets
    - Removido secret antigo `SHOPIFY_ADMIN_ACCESS_TOKEN` após validação em produção
- **Arquivos editados:**
  - Migration: `supabase/migrations/<timestamp>_shopify_admin_tokens.sql` (criado)
  - `supabase/functions/_shared/shopify-admin-auth.ts` (criado)
  - `supabase/functions/update-shipping-variant-price/index.ts` (refatorado)
  - `supabase/functions/shopify-customer-sync/index.ts` (refatorado)
  - `src/pages/Carrinho.tsx` (canCheckout + diagnóstico defensivo)
- **NÃO foi tocada:** `shopify-webhook-receiver` (só usa HMAC, não chama Admin API), as 3 edges Uber (não chamam Admin API).
- **Regras adicionadas:** R51 (OAuth Client Credentials para Admin API), R52 (hard-block canCheckout) em `requirements.md`.
- **Documentação atualizada:** `fluxo-uber-direct.md` (5 gotchas novos sobre auth + cache + retry), `fluxo-shopify-sync.md` (nota sobre nova autenticação), `fluxo-carrinho-checkout.md` (regra + gotcha sobre hard-block).

### Pendências novas (Sprint 4.7)

- **Validação manual obrigatória pós-deploy:**
  - Confirmar no SQL Editor que `shopify_admin_tokens` tem 1 row com `expires_at ~24h no futuro` após primeira chamada.
  - Conferir no Shopify Admin que cart ativo tem 1 linha "Frete Uber Direct" com preço atualizado.
  - Confirmar que `/carrinho` exibe TOTAL = subtotal + frete (R$ 29,44 no cenário de teste).
  - Console sem warnings `[Carrinho] Discrepância detectada` em fluxo normal.
- **Limpeza pós-validação:** após confirmar Track A funcionando em produção (24h+), DELETAR o secret `SHOPIFY_ADMIN_ACCESS_TOKEN` dos Edge Function Secrets (Track C, Passo 5). Redeploy todas as edges.
- **Débito de operação:** documentar em runbook (Notion ou similar) o procedimento de rotação periódica do `client_secret` (recomendado a cada 6 meses). A rotação invalida o token cached imediatamente — próximo `getShopifyAdminToken()` faz refresh automático.

### Notas para a próxima sessão

- **Lição arquitetural:** secrets de longo prazo são frágeis. Sprint 4.7 substituiu um secret estático que silenciosamente expirou e travou 2 features em produção. Sempre que possível, usar OAuth ou outro flow com refresh automático.
- **Padrão a seguir em features futuras envolvendo Shopify Admin:** sempre importar `getShopifyAdminToken()` do helper compartilhado. NUNCA ler `SHOPIFY_ADMIN_ACCESS_TOKEN` direto do env (esse secret nem existe mais). Se aparecer code review com `Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN")` em qualquer edge nova, rejeitar.
- **Token `atkn_` é separado:** o "Token de automação de app" do Dev Dashboard (`atkn_xxx`) é exclusivo pra CI/CD via `shopify app deploy`. NÃO é Admin API token. Se aparecer tentativa de usar em chamadas REST/GraphQL, vai falhar 401.
- **Webhook receiver continua usando `SHOPIFY_WEBHOOK_SECRET`** (que é o mesmo `client_secret` usado pra HMAC). Esse secret NÃO mudou — continua sendo lido direto do env porque é usado pra signature, não auth. Se rotacionar o client_secret no Dev Dashboard, atualizar `SHOPIFY_WEBHOOK_SECRET` no Supabase em PARALELO com `SHOPIFY_CLIENT_SECRET`.
- **Débitos de segurança Sprint 4.1 ainda abertos:** HMAC no `uber-webhook-receiver`, validação server-side de `shipping_fee_cents`. Sprint 4.7 não mitiga esses débitos — mas com Sprint 4.7 mergeada, o `shipping_fee_cents` no webhook `orders/paid` agora reflete o valor REAL cobrado (porque a variant fantasma entra no cart de verdade). Antes, esse campo vinha frequentemente como 0 pelo bug raiz.
- **Próxima ação no `state.md`:** considerar abrir Sprint 5 com foco nos débitos de segurança restantes (HMAC Uber webhook + server-side validation `shipping_fee_cents`) + integração Bling ERP.

## O que foi feito na sessão anterior (Sprint 4.6 — Fix regressão de re-render)

- **Bug corrigido:** após Sprint 4.5, o TOTAL exibido no `/carrinho` deixou de somar o frete. Sintoma: subtotal R$ 18,94 + frete R$ 10,50 mostrava TOTAL = R$ 18,94 (sem somar). A linha "Frete R$ 10,50" aparecia na UI, mas não refletia no total nem no Shopify Cart.
- **Causa raiz:** ciclo de re-render no `Carrinho.tsx` fazia o `useEffect` de sincronização da variant fantasma no `<ShippingMethodSelector />` cancelar seu próprio `setTimeout(sync, 300)` repetidamente. A variant fantasma nunca era adicionada ao Shopify Cart. Como `displayTotal = cartCost.totalAmount` (Shopify), o valor refletia só os itens normais.
- **Por que a Sprint 4.5 piorou:** o REPLACE atômico introduzido em 4.5 faz 2 chamadas Shopify em série (`removeLineFromShopifyCart` + `addLineToShopifyCart`), aumentando a janela de execução do `sync()`. Antes, o `sync()` era mais rápido (1 chamada) e às vezes conseguia completar entre cancellations. Após 4.5, sempre era cancelado antes de completar.
- **Cadeia exata do bug:**
  1. `DeliveryAddressSelector.useEffect` chamava `onResult(buildResultFromAddress(selected))` — objeto novo a cada render.
  2. `Carrinho.tsx` fazia `setDeliveryCheck(novoObjeto)` → re-render.
  3. `<ShippingMethodSelector deliveryCheck={novoObjeto}>` re-renderizava.
  4. Dentro do componente, `cepParams` era objeto literal novo a cada render.
  5. O `useEffect` de sync tinha `cepParams` E `deliveryCheck` nas deps → identidade muda → re-roda.
  6. Cleanup `clearTimeout(timer)` cancelava antes dos 300ms → `sync()` nunca executava.
- **Solução (defesa em profundidade, 2 camadas):**
  - **Camada 1 — produtor (`DeliveryAddressSelector.tsx`):** memoizar `CepValidationResult` derivado do endereço selecionado via `useMemo` com chaves primitivas (id, cep, city, state, street, number, complement, neighborhood). Substituído também o useEffect que reporta pro pai pra consumir o memo em vez de chamar `buildResultFromAddress` inline.
  - **Camada 2 — consumidor (`ShippingMethodSelector.tsx`):** memoizar `cepParams` interno via `useMemo` com chaves primitivas do `deliveryCheck.cepInfo`. Adicionado logging defensivo: contador `cancelCountRef` dispara `console.warn` se ≥ 5 cancellations consecutivas sem sync completar. Em DEV, warning adicional quando effect re-roda sem mudança de deps primitivas.
- **Arquivos editados:** `src/components/DeliveryAddressSelector.tsx`, `src/components/ShippingMethodSelector.tsx`. 0 migrations, 0 edge functions, 0 mudanças em `Carrinho.tsx`, 0 mudanças no `cartStore`.
- **Regras novas:** Nenhuma em `requirements.md`. Fix arquitetural sem alteração de regra de negócio.
- **Documentação atualizada:** `fluxo-uber-direct.md` (3 gotchas novos), `fluxo-carrinho-checkout.md` (1 gotcha novo).

### Pendências novas (Sprint 4.6)

- **Validação manual obrigatória pós-deploy:**
  - Abrir `/carrinho` com 1 marmita + endereço SJC válido. Confirmar que TOTAL = subtotal + frete (ex: R$ 18,94 + R$ 10,50 = R$ 29,44 exato).
  - Conferir no Shopify Admin → Active carts que existe exatamente 1 linha de "Frete Uber Direct" com o preço correto.
  - Abrir Console do navegador e confirmar ausência de warning "Effect re-render loop detectado".
- **Cenários de regressão a testar manualmente:**
  - Subir cart pra 7+ marmitas → variant fantasma sai do cart, TOTAL = subtotal sem frete (correto, frete grátis).
  - Voltar pra 6 marmitas → variant fantasma volta, TOTAL = subtotal + frete novo.
  - Trocar endereço (SJC → outro SJC) → variant fantasma re-cotada, TOTAL atualiza com o novo frete.
  - Trocar endereço (SJC → fora SJC) → variant fantasma sai do cart, mensagem "Não entregamos" no `<ShippingMethodSelector />`.
  - Reload da página com cart de 6 marmitas + endereço SJC → variant fantasma é re-adicionada automaticamente pelo effect de sync no mount.

### Notas para a próxima sessão

- **Lição aprendida (importante):** quando um `useEffect` tem objeto literal nas deps, esse objeto precisa ser memoizado UPSTREAM (no produtor) E DOWNSTREAM (no consumidor onde está sendo derivado novamente). Se memoizar só num lado, vaza pelo outro. Sprint 4.5 + 4.6 ilustram essa lição: 4.5 introduziu o REPLACE atômico assumindo identidade referencial estável (que não existia), 4.6 corrigiu fechando a cadeia.
- **Padrão a seguir em features futuras envolvendo `deliveryCheck`:** se aparecer um terceiro consumer do `CepValidationResult` (ex: componente de cálculo de prazo de entrega, badge de cobertura no Header, etc), ele DEVE memoizar internamente quaisquer derivações antes de usar em deps de useEffect. O padrão está documentado em `fluxo-carrinho-checkout.md` gotcha novo.
- **Logging defensivo é canário em produção:** o warning "Effect re-render loop detectado" foi projetado pra disparar APENAS em regressões reais (5 cancellations consecutivas sem sync completar é cenário anormal). Se aparecer em logs de produção, investigar imediatamente — provável regressão de memoização similar.
- **Débitos de segurança da Sprint 4.1 ainda abertos:** HMAC no `uber-webhook-receiver`, validação server-side de `shipping_fee_cents`. Fix de 4.6 não mitiga (apenas garante que cliente legítimo seja cobrado corretamente).
- **Próxima ação no `state.md`:** se as 5 sessões de fix (4.1, 4.2, 4.3, 4.4, 4.5, 4.6) estiverem completas e o cart estiver estável em produção, considerar fechar Sprint 4 e abrir Sprint 5 com foco nos débitos de segurança + integração Bling ERP.

## O que foi feito na sessão anterior (Sprint 4.5 — Fix bug do frete duplicado)

- **Bug corrigido:** o total exibido no `/carrinho` somava o frete múltiplas vezes (sintoma reportado: subtotal R$ 18,94 + frete R$ 10,50 deveria dar R$ 29,44, mas mostrava R$ 36,76 — diferença de R$ 7,32, indicando 2 linhas da variant fantasma no Shopify Cart com cotações diferentes).
- **Causa raiz:** `cartStore.addItem` tratava a variant fantasma como item normal e somava `quantity` no branch `existingItem`. Combinado com cart hidratado do `localStorage` em estado bugado de sessão anterior, gerava múltiplas linhas no Shopify Cart com preços de cotações distintas. O `displayTotal` exibido vem do `cartCost.totalAmount` do Shopify (fonte da verdade), por isso o número errado refletia direto na UI.
- **Solução (defesa em profundidade, 2 camadas):**
  - **Camada 1 — store:** `cartStore.addItem` detecta `isShippingVariant(variantId)` e, se a variant fantasma já existe, faz REPLACE atômico (`removeLineFromShopifyCart` + `addLineToShopifyCart`) em vez de somar quantity. Early return impede o fluxo normal de executar em sequência.
  - **Camada 2 — componente:** `<ShippingMethodSelector />` ganhou effect de cleanup defensivo no mount (one-shot, guard via `useState`) que detecta variant fantasma com `quantity > 1` herdada do localStorage e remove antes do effect de sincronização rodar. Simplificou também o effect de sync — não precisa mais do bloco condicional `if (latestShippingItem) await removeItem(...)`, porque o `addItem` agora faz REPLACE atômico internamente.
- **Arquivos editados:** `src/stores/cartStore.ts` (addItem refatorado), `src/components/ShippingMethodSelector.tsx` (cleanup + sync simplificado). 0 migrations, 0 edge functions.
- **Regras adicionadas:** R50 em `requirements.md` (variant fantasma é singleton).
- **Documentação atualizada:** `fluxo-uber-direct.md` (3 gotchas novos + referência R50), `fluxo-carrinho-checkout.md` (regra 5 expandida + 1 gotcha novo).

### Pendências novas (Sprint 4.5)

- **Validação manual obrigatória pós-deploy:** abrir `/carrinho` com 1 marmita + endereço SJC válido, conferir no Shopify Admin → Active carts que existe apenas UMA linha de "Frete Uber Direct", e confirmar que TOTAL no resumo = subtotal + frete (sem diferença).
- **Cenários de regressão a testar manualmente:**
  - Adicionar 1 marmita → cart cria variant fantasma com cotação X
  - Trocar endereço → cotação re-cota com valor Y → confirmar que cart tem apenas 1 linha com valor Y (não 2 com X+Y)
  - Subir pra 7 marmitas → variant fantasma é removida → cart tem 0 linhas de frete
  - Voltar pra 6 marmitas → variant fantasma volta com 1 única linha
  - Recarregar a página com cart em qualquer estado → cleanup defensivo no mount não deve causar comportamento visível ao usuário

### Notas para a próxima sessão

- O `<ShippingMethodSelector />` agora confia 100% no `cartStore.addItem` para o singleton da variant fantasma. Se alguém mexer no `addItem` esquecendo da regra R50, o componente NÃO vai mais compensar — o cleanup defensivo só pega o caso de localStorage bugado, não regressões do próprio store.
- O cleanup defensivo é one-shot (guard `didCleanupOnMount`) — depois do primeiro mount da sessão, ele não roda mais. Isso é proposital pra não interferir com o flow normal do effect de sync.
- Os débitos de segurança da Sprint 4.1 (HMAC no `uber-webhook-receiver`, validação server-side de `shipping_fee_cents`) continuam abertos. O fix dessa sprint NÃO mitiga esses débitos — apenas evita que o cliente legítimo seja cobrado errado. Cliente malicioso ainda pode burlar via console zerando preço da variant.

## O que foi feito na sessão anterior (Sprint 4.4 — Cupom PIX condicional)

- **Bug corrigido:** cupom PIX falhava silenciosamente em carrinhos ≥7 marmitas porque `PIX5` está configurado como NÃO combinável no Shopify Admin e conflitava com os Automatic Discounts dos Kits (7/14/21/28).
- **Solução:** introduzir cupom novo `PIX3` (3% off, combinável com descontos de produto), aplicado quando carrinho ≥7. PIX5 mantido inalterado para <7.
- Cupom `PIX3` criado manualmente no Shopify Admin (paridade de 26 produtos elegíveis com PIX5).
- `src/components/PaymentMethodSelector.tsx` refatorado:
  - Helper `getPixCouponForCart(totalNonShippingItems)` retorna `{ code, percent }` condicional ao threshold (`SHIPPING_FREE_THRESHOLD`)
  - Nova prop `totalNonShippingItems` (passada pelo Carrinho.tsx)
  - Badge dinâmico ("PIX 3% off" ou "PIX 5% off")
  - `useEffect` de reatividade: troca cupom automaticamente quando cliente cruza threshold com PIX selecionado
  - `console.error` com payload do cart sempre que Shopify retorna `applicable=false` inesperado
- `src/pages/Carrinho.tsx`: passa `totalNonShippingItems={totalNonShippingItems}` ao `<PaymentMethodSelector />` (1 linha)
- R19 reescrita em `requirements.md` documentando a regra condicional + diagnóstico
- `fluxo-carrinho-checkout.md` regra 9 substituída + 3 gotchas adicionados
- 1 componente editado, 1 página editada (1 linha), 0 migrations, 0 edge functions

### Pendências novas (Sprint 4.4)

- **Débito técnico (UX):** `PixCallout.tsx` ainda diz estaticamente "PIX 5% off" em Product/CartDrawer/Kit/KitLivre. Para clientes que pretendem fechar ≥7 marmitas, isso é uma inconsistência educativa (vitrine promete 5%, carrinho aplica 3%). Sprint futura: tornar o callout sensível à quantidade do carrinho ou exibir "PIX 5% ou 3% off conforme quantidade".
- **Validação de produção:** após deploy, testar fluxo end-to-end real em todas as faixas de quantidade (1, 6, 7, 13, 14, 20, 21, 27, 28+) e confirmar que o Shopify Admin Orders mostra cada cupom corretamente aplicado.

### Notas para a próxima sessão

- Se `PIX5` ou `PIX3` forem desativados ou tiverem combinabilidade alterada no Shopify Admin, o frontend precisa ser ajustado em paralelo. O par é coreografado.
- O threshold de troca de cupom (`SHIPPING_FREE_THRESHOLD = 7`) é COMPARTILHADO com: regra de frete Uber Direct (R34), Kits do Shopify (Kit 7/14/21/28). Qualquer mudança no número 7 impacta esses TRÊS sistemas + a regra PIX.
- O diagnóstico `console.error` com payload do cart vai ajudar a detectar futuros desalinhamentos entre Shopify Admin e código (ex: alguém renomear o cupom, mexer em combinabilidade, expirar a data).

## O que foi feito na sessão anterior (Sprint 4.3 — Seletor de endereço no carrinho)

- Criado componente `src/components/DeliveryAddressSelector.tsx` (4 estados: guest, loading, vazio, lista)
- Adicionado helper síncrono `isAreaDeliverable(uf, city)` em `src/lib/cepValidator.ts`
- Substituído `<CepChecker />` por `<DeliveryAddressSelector />` no `src/pages/Carrinho.tsx`
- Adicionado cart attribute `selected_address_id` no `handleCheckout` (2 ocorrências — handler direto + useEffect pós-login)
- Reusados sem mudança: `<AuthDialog />`, `<AddressFormDialog />`, `useAddresses()`, `<ShippingMethodSelector />`
- 1 componente criado, 2 arquivos editados, 0 migrations
- Regras adicionadas: R46, R47, R48, R49 em `requirements.md`

### Pendências novas (Sprint 4.3)
- Débito técnico: migrar dados legados de `profiles.address/cep/...` para a tabela `addresses` via script SQL idempotente (fora do escopo desta sprint)

### Notas para a próxima sessão
- Se aparecer pedido de "remover CepChecker do codebase", verificar antes onde mais ele é usado — neste momento só `/carrinho` consumia, e a regra R49 explicita que o componente foi preservado.
- A whitelist `DELIVERY_AREAS` continua em `cepValidator.ts`. Expandir cobertura = editar essa constante (sem touch em DB).
- O cart attribute `selected_address_id` pode ser consumido pelo `shopify-webhook-receiver` em sprint futura se quisermos cross-check do endereço do pedido contra o cadastrado no Supabase.

## O que foi feito na sessão anterior (Sprint 4.2 — Return URL no checkout Shopify)

- `src/config/site.ts` criado: exporta `SITE_URL` (com fallback `https://jilomarmitas.com` e override via `VITE_SITE_URL`) e `SITE_HOSTNAME`. Fonte única de URL canônica no frontend (equivalente em runtime do `SITE_URL` já usado pelo gerador SEO em build time).
- `src/lib/shopify.ts` ganhou helper `appendReturnToCheckoutUrl(checkoutUrl, returnTo?)` que adiciona `?return_to=<SITE_URL>` ao checkout antes do redirect (fail-safe via try/catch).
- `src/pages/Carrinho.tsx` `handleCheckout` (e seu useEffect espelho de auto-checkout pós-login) agora gravam cart attribute `return_url` junto com `delivery_method` e `uber_quote_id`, e o checkout é aberto com `appendReturnToCheckoutUrl`.
- `src/pages/Product.tsx` `handleBuyNow` recebeu o mesmo tratamento (cart attribute + helper).
- R45 adicionada ao `requirements.md` documentando o padrão.
- `fluxo-carrinho-checkout.md` atualizado (regra 13, nova regra 18, gotchas, tabela de arquivos).
- Pré-requisito complementar (manual no Shopify Admin): configurar `checkout.jilomarmitas.com` como domínio primário em Settings → Domains.
- O `CartDrawer.tsx` não precisou de mudança (não vai direto pro checkout — navega `/carrinho`).
- Edge Functions não precisaram de mudança: `note_attributes` propagam pro webhook `orders/paid` automaticamente; o atributo `return_url` aparece como `note_attribute` no pedido sem código novo.
- ⚠️ Importante: A solução originalmente cogitada de injetar JavaScript via "Additional Scripts" na Order Status Page foi descartada. A Shopify descontinuou essa funcionalidade em 28/08/2025 (read-only desde então; auto-upgrade dos não-Plus iniciando jan/2026). Customizações JS na thank-you page hoje exigem Checkout UI Extensions (apps Shopify), o que está fora do escopo deste Sprint. A combinação código + domínio primário é suficiente.

## O que foi feito na sessão anterior (Sprint 4.1 — Frete Uber Direct)

- Migration `20260429000000_orders_uber_delivery_fields.sql` adicionando 6 campos a `orders` (já existia, agora documentada)
- Script `scripts/setup-shipping-variant.ts` (já existia) cria produto fantasma "Frete Uber Direct" no Shopify (REST API, idempotente)
- Adicionado scope `write_products` ao Custom App existente — **NÃO foi necessário**: validação em 2026-04-29 confirmou que o app já tinha 178 scopes ativos, incluindo todos os necessários para a feature. Pulamos o passo de reinstalação.
- 4 Edge Functions novas: `uber-quote`, `update-shipping-variant-price` (GraphQL), `uber-create-delivery`, `uber-webhook-receiver`
- `shopify-webhook-receiver` estendido: handler `orders/paid` popula campos Uber e dispara delivery fire-and-forget
- `src/config/shipping.ts` + `supabase/functions/_shared/shipping-constants.ts` com `SHIPPING_FREE_THRESHOLD = 7`
- `src/lib/uberDirect.ts` cliente das edges
- `src/hooks/useNonShippingTotalItems.ts` + `useVisibleCartItems` (selectors)
- `src/hooks/useShippingQuote.ts` (TanStack Query, staleTime 14min)
- `src/lib/shopify.ts` ganhou mutation `cartAttributesUpdate` + helper `setCartAttributes`
- `src/components/ShippingMethodSelector.tsx` novo componente
- `Carrinho.tsx` integrado (`<ShippingMethodSelector />` no resumo, `handleCheckout` async grava cart attributes)
- `CartDrawer.tsx` integrado (mensagem condicional de frete)
- `cepValidator.ts` removida menção a "Frete grátis" da mensagem de CEP atendido
- R34 a R44 adicionadas em `requirements.md`. R16 e R17 marcadas como atualizadas.
- `fluxo-uber-direct.md` criado documentando todo o fluxo
- `fluxo-carrinho-checkout.md`, `fluxo-shopify-sync.md` atualizados

## Histórico de sprints
- **Sprint 1 (2026-04-16)** — Área do cliente completa (auth, perfil, pedidos, endereços, timeline)
- **Sprint 2 (2026-04-16)** — Shopify customer sync + checkout gating
- **Sprint 3 (2026-04-22)** — SEO tradicional + GEO (llms.txt) com geração em build time + correção do domínio canônico
- **Sprint 3.5 (2026-04-22)** — Correção do shell HTML: meta tags estáticas completas, favicon válido, og-image própria, robots.txt regenerado
- **Sprint 4.1 (2026-04-29)** — Frete Uber Direct condicional
- **Sprint 4.2 (2026-05-11)** — Return URL no checkout Shopify (`return_to` querystring + cart attribute `return_url`) e centralização da constante `SITE_URL` em `src/config/site.ts`
- **Sprint 4.3 (2026-05-18)** — Seletor de endereço no carrinho (`<DeliveryAddressSelector />` substituindo `<CepChecker />`, cart attribute `selected_address_id`)
- **Sprint 4.4 (2026-05-20)** — Cupom PIX condicional por quantidade (PIX5 < 7 marmitas, PIX3 ≥ 7)
- **Sprint 4.5 (2026-05-27)** — Fix variant fantasma duplicada no cart (REPLACE atômico no `cartStore` + cleanup defensivo no `<ShippingMethodSelector />`)
- **Sprint 4.6 (2026-05-27)** — Fix regressão Sprint 4.5: variant fantasma não entrava no cart (memoização de `CepValidationResult` no produtor + `cepParams` no consumidor + logging defensivo)
- **Sprint 4.7 (2026-05-27)** — Refatoração OAuth Client Credentials Grant para Shopify Admin API (tabela `shopify_admin_tokens` + helper `_shared/shopify-admin-auth.ts`) + hard-block do `canCheckout` validando estado real do Shopify Cart
- **Sprint 4.8 (2026-05-28)** — TOTAL da página de carrinho via somatória local (`subtotal + frete`), desacoplando display da cobrança Shopify
- **Sprint 5.0 (2026-06-01)** — Causa raiz resolvida: produto fantasma estava publicado só no Point of Sale, não no Online Store; fix = publicar no Online Store + `status: ACTIVE` + filtro `-tag:__internal_shipping` nas queries de catálogo. UNLISTED foi testado e NÃO é exposto pela Storefront desta loja. Validação pós-add (R55) mantida como defesa.
- **Sprint 5.1 (2026-06-03 / 06-15, consolidada no merge)** — Kit em múltiplos de 7 com UX acionável (R56), frete grátis blindado na transição ≥7 (R58), cupom PIX efêmero reconciliado no load (R57) e hard-block por presença da linha de frete `shopifyHasShippingLine` (R59, substitui o `totalMatchesShopify` — resolve o bug do PIX travando o checkout). Criados `kitQuantity.ts`, `pixCoupons.ts`, `KitQuantityNotice.tsx`. Em paralelo (branch `fi`): desconto de kit visível no carrinho via agregação de `line.discountAllocations` + TOTAL com desconto + base do PIX descontada (R60). 0 migrations, 0 edge functions.


## Pendências

### Carryover Sprint 3.5
- Submeter `sitemap.xml` no Google Search Console e Bing Webmaster Tools após o go-live
- Request Indexing no GSC para home, /cardapio e /colecao/* após deploy do Sprint 3.5
- Preencher `<meta name="google-site-verification" content="..." />` no index.html
- Substituir og-image.jpg provisória se foi usado fallback
- Testar ingestão do `llms-full.txt` em conversas com ChatGPT, Claude e Perplexity

### Carryover Sprint 1/2
- Débito técnico: testar fluxo end-to-end de signup → confirmação de email → sync Shopify
- Débito técnico: validação de CPF com máscara + checksum
- Débito técnico: integração ViaCEP no AddressFormDialog
- Débito de segurança: migrar anon key do Supabase para `.env`

### Sprint 4.1 — débitos novos
- **Débito de segurança CRÍTICO:** webhook `uber-webhook-receiver` NÃO valida HMAC ainda — implementar antes do go-live
- **Débito de segurança:** validação server-side de `shipping_fee_cents` (cliente pode burlar via console zerando preço da variant antes do `cartLinesAdd`). Mitigação: comparar com cotação Uber re-confirmada no webhook `orders/paid`
- **Débito de produto:** UI admin para gerenciar orders com `delivery_status='jilo_pending'` (≥ 7 marmitas, despache manual)
- **Débito de produto:** Tracking link Uber (`uber_tracking_url`) na área do cliente em `/conta/pedidos/:id`
- Testar end-to-end em sandbox Uber Direct antes de switch para produção (`UBER_API_BASE`)
- Validar lat/lng do pickup Jilo com endereço real da cozinha

### Sprint 4 (resto, ainda não tocado)
- Estender `shopify-webhook-receiver` para popular `order_items` (tabela normalizada) — hoje `line_items` jsonb continua sendo usado
- Garantir que `orders.user_id` seja preenchido via lookup por email no webhook
- Webhook `customers/update` para refletir mudanças do Shopify no Supabase
- Integração Bling ERP

## Próximos passos planejados

Sprint 4.3 — endurecimento Uber (renomeado do 4.2 original):
1. Validação HMAC no `uber-webhook-receiver`
2. Validação server-side de `shipping_fee_cents` no `shopify-webhook-receiver`
3. Painel admin para `jilo_pending` orders (UI mínima em `/conta/admin` ou similar)

Sprint 4 (resto):
1. Migrar webhook receiver de `line_items` jsonb para `order_items` normalizado
2. Lookup de `user_id` por email
3. Webhook `customers/update`
4. Integração Bling ERP

## Notas para a próxima sessão
- **IMPORTANTE — auth Shopify Admin mudou (Sprint 4.7):** o secret `SHOPIFY_ADMIN_ACCESS_TOKEN` não existe mais. Toda chamada à Admin API passa por `getShopifyAdminToken()` em `_shared/shopify-admin-auth.ts`. Secrets que vivem nas Edge Functions: `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET`. Ver R51 em `requirements.md`.
- Domínio canônico do site é `https://jilomarmitas.com` — usar sempre essa URL em qualquer referência a links absolutos
- Ao adicionar novo prato ao cardápio: rodar `npm run seed` depois `npm run seo` e comitar os arquivos gerados
- Ao trocar logo ou og-image: substituir arquivos em `public/`, commitar, publicar, e forçar Request Indexing no GSC
- `llms.txt` e `llms-full.txt` são padrões emergentes — a spec pode evoluir. Monitorar llmstxt.org
- Se em qualquer momento surgir necessidade de adicionar subdomínio (ex: blog.jilomarmitas.com), criar sitemap separado e referenciá-lo no robots.txt
- Meta tags globais continuam no `index.html` estático (R31). Se o projeto crescer e precisar de meta tags por rota (ex.: SEO por produto na página `/produto/:handle`), adicionar `react-helmet-async` sem remover o que está no shell — o shell é fallback para quem não roda JS
- **Frete Uber Direct está em produção (Sprint 4.1)** — qualquer mudança no threshold de 7 marmitas exige editar `src/config/shipping.ts` E `supabase/functions/_shared/shipping-constants.ts` (manter sincronizados)
- O produto fantasma "Frete Uber Direct" no Shopify Admin tem `status: draft` propositalmente — NÃO publicar
- O Custom App Shopify usa um token de "full access" (178 scopes, incluindo `write_products`). Se for revogado/rotacionado, substituto precisa manter pelo menos `write_customers`, `write_products`, `read_orders`, `write_orders`. Atualizar em DOIS lugares: `.env` local (`SHOPIFY_ADMIN_TOKEN`) e Edge Function Secrets (`SHOPIFY_ADMIN_ACCESS_TOKEN`) — nomes diferentes, mesmo valor. (Valor literal do token NÃO fica documentado aqui — vive apenas nos secrets.)
- Se Uber lançar API nova ou mudar payload de webhook, ajustar `UBER_STATUS_MAP` em `uber-webhook-receiver/index.ts`
- Edges chamadas server-to-server (`uber-create-delivery`) são deployadas com `--no-verify-jwt` e validam o `Authorization: Bearer <service_role>` manualmente
- **URL de auth da Uber é `auth.uber.com/oauth/v2/token`** (validado contra doc oficial em 2026-04-29). Scope único: `eats.deliveries`. Token vale 30 dias.
- **Customer ID Uber:** o que aparece no painel como "ID do usuário" (formato UUID) é o que vai nas URLs `/v1/customers/{customer_id}/...`. NÃO confundir com `client_id` (OAuth)
- **Débito de operação:** o `client_secret` cadastrado precisa ser confirmado contra o painel Uber Direct. Se foi rotacionado depois do compartilhamento inicial, atualizar o secret no Supabase
- Antes do go-live, validar se as credenciais Uber são de sandbox ou produção. No painel: aviso azul "Test mode" no topo = sandbox. Sem aviso = produção.
- **Sprint 4.2:** Após deploy do código, confirmar no Shopify Admin: `checkout.jilomarmitas.com` configurado como domínio primário e SSL ativo. Esse passo manual é complementar ao código — sem ele, o `?return_to=` pode não ser honrado em todos os flows.
- `VITE_SITE_URL` pode ser usado pra apontar pra ambientes não-produção (staging/preview) sem mexer no código — coloca no `.env` local ou nas vars do hosting. Sem override, fallback é sempre `https://jilomarmitas.com`.
- **Sobre customização da thank-you page Shopify:** Se em algum momento precisarmos sobrescrever o botão "Continue Shopping" ou injetar lógica na thank-you page (pixel custom, mensagem personalizada), a única via válida hoje é construir uma Checkout UI Extension como app Shopify dedicada — Additional Scripts foi descontinuado. Estimativa: 2–3 dias de dev. Priorizar somente se houver demanda concreta.
