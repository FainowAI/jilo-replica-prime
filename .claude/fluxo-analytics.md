# Fluxo: Analytics (PostHog — produto)

> EAP Visibilidade de Dados, **Sprint B**. PostHog = instrumentação de **produto** (funil, replay, flags). GA4 (aquisição) é a **Sprint C** e reusa este scaffolding. Decisões D4/D5/D6 da EAP.

## Visão geral
Instrumentação de produto via PostHog (`posthog-js` + `@posthog/react`), **só em produção**. Captura automática de pageview (SPA) + autocapture, mais 8 eventos de negócio nomeados (funil). Identificação por `user.id`. PII protegida por design (masking de URL + sem CPF/email).

## Arquivos
| Arquivo | Papel |
|---------|-------|
| `src/analytics/posthog.ts` | Init + **gate prod-only** + **masking de PII** (`before_send`) + helpers `track`/`identifyUser`/`resetAnalytics`. Único ponto que decide ativação (`analyticsEnabled`). |
| `src/analytics/events.ts` | Dicionário tipado dos 8 eventos (`analytics.*`). Sem PII nas props. |
| `src/main.tsx` | `initAnalytics()` + `<PostHogProvider client={posthog}>` envolvendo o App. |
| `src/contexts/AuthContext.tsx` | `identify(user.id)` no SIGNED_IN e na restauração de sessão; `reset()` no SIGNED_OUT; eventos `login efetuado`/`cadastro concluído`. |
| `src/stores/cartStore.ts` | `item adicionado` + `kit montado` (chokepoint central no `addItem`). |
| `src/pages/Carrinho.tsx` | `carrinho aberto` (mount) + `checkout iniciado` (`handleCheckout`). |
| `src/components/CartDrawer.tsx` | `carrinho aberto` (abertura do drawer). |
| `src/pages/Product.tsx` | `produto visualizado` (load) + `checkout iniciado` (Buy Now). |
| `src/hooks/useAddresses.ts` | `endereço cadastrado` (`useCreateAddress.onSuccess`). |

## Configuração (env — passo MANUAL B.1.1)
Definir no hosting de produção (NÃO commitar):
| Env var | Exemplo | Notas |
|---------|---------|-------|
| `VITE_PUBLIC_POSTHOG_KEY` | `phc_...` | Project API Key (pública por design; ainda assim via env). |
| `VITE_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` | Host do projeto PostHog. Default no código se ausente. |

Sem a key, `analyticsEnabled = false` e todos os helpers viram **no-op** — nada quebra.

## Gate de ativação (D5 — prod-only)
`analyticsEnabled = !!KEY && import.meta.env.PROD && hostname ∈ jilomarmitas.com`
(`SITE_HOSTNAME` de `src/config/site.ts`; cobre `jilomarmitas.com` e subdomínios). Em dev (`vite dev`), preview, ou domínio diferente → **inerte**. Evita poluir os dados com tráfego de desenvolvimento.

## LGPD / PII
- **identify** usa só `user.id` (UUID) — NUNCA email/CPF/telefone como person property.
- **Masking de URL** (`before_send`): mascara `/conta/pedidos/<id>` → `/conta/pedidos/:id` e qualquer UUID em `$current_url`/`$pathname`/`$referrer`. Único ponto de saída de eventos do browser.
- **Eventos sem PII**: ver dicionário abaixo (UF/cidade do endereço não são PII identificável isolada; rua/CEP NÃO entram).
- `person_profiles: 'always'` (D4) — perfil para todo visitante (decisão consciente de custo; revisitar se o volume crescer).

## Dicionário de eventos (Seção 5 da EAP — compartilhado com GA4/Sprint C)
| Evento | Quando | Props (sem PII) |
|--------|--------|-----------------|
| `produto visualizado` | abre página de produto | handle, grupo, preco |
| `item adicionado` | add ao carrinho (exclui variant fantasma de frete) | handle, grupo, qtd |
| `carrinho aberto` | abre CartDrawer ou `/carrinho` | itens, subtotal |
| `kit montado` | itens (sem frete) cruzam múltiplo de 7 | tamanho |
| `checkout iniciado` | "Ir para o Checkout" / Buy Now | itens, frete (`gratis`/`pago`), metodoEntrega |
| `cadastro concluído` | signup com sucesso | — |
| `login efetuado` | login com sucesso | — |
| `endereço cadastrado` | cria endereço | uf, cidade, deliverable (bool) |

> `grupo` deriva de `product.productType || product.tags?.[0] || null` (regra única). `kit montado` dispara só ao CRUZAR para um múltiplo positivo de 7 (`novoTotal % 7 === 0 && totalAntes % 7 !== 0`). `carrinho aberto` dispara nos dois pontos (drawer + página) — intencional.

## Coordenação com a Sprint A (EAP Seção 6)
`AuthContext.tsx` é o único arquivo tocado pelas duas frentes. A Sprint A adicionou o disparo do `customer-sync` no SIGNED_IN; a Sprint B adicionou `identify`/`reset` **no mesmo bloco**. Convivem sem conflito.

## Gotchas
- O `<PostHogProvider client={posthog}>` é montado sempre, mas o `posthog` só é `init()` em produção — o provider com client não-inicializado é inofensivo (não usamos `usePostHog`; o código chama o singleton via helpers guardados).
- `before_send` é o único masking — se novos eventos passarem URL/ids em props customizadas, garantir que não vaza PII ali também.
- A Sprint C (GA4) deve **reusar** `analyticsEnabled` e o helper de masking deste módulo (não duplicar o gate).
