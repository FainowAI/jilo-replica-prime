# EAP — Jilo: identidade, pedidos e pagamentos na Shopify

| Campo | Valor |
|---|---|
| Projeto | Jilo Marmitas (DaJu Alimentação) — jilo-replica-prime |
| Tipo | MVP de Produto (migração parcial de arquitetura, em produção) |
| Data | 2026-10-09 |
| Stack | React 18 + Vite (Lovable), Shopify Basic (Storefront + Admin + Customer Account API), Supabase (Edge Functions + Postgres), Uber Direct, Cielo E-commerce |
| Regra de dimensionamento | 4-40 (mín. 4h, máx. 40h por work package) |
| Esforço total estimado | ~204h (≈ 5 a 6 semanas, 1 dev) + gates externos |
| Discovery | Não houve. Briefing montado por evidência: 8 code-explorers, banco real, loja real, e-mails, WhatsApp, docs Shopify. Pontos a validar na seção 10. |

---

## 1. Resumo executivo

A pergunta era: "ver compras, perfil etc. poderiam estar dentro da Shopify?" **Sim, e é o caminho recomendado.** A Shopify Basic já cobre, sem Plus e sem Hydrogen: conta de cliente com login Google, página de pedidos, endereços, perfil e checkout identificado, via Customer Account API (OAuth + PKCE numa SPA React). O que **não** deve sair do Supabase: o despacho da Uber Direct (webhook + espelho `orders`), os pagamentos fora do checkout (VR hoje, Alelo via Cielo amanhã) e a infra de webhooks.

Os problemas relatados têm causas raiz distintas, todas comprovadas nesta sessão:

| Sintoma | Causa raiz comprovada | Fonte |
|---|---|---|
| Cliente logou pelo Google, comprou, "Meus pedidos" dá problema | `shopify-customer-sync` usa `customerCreate(identifier:)`, argumento **inexistente** na Admin API 2025-10 → 502 em todo login. **0 de 22** usuários Google e **0 de 19** usuários criados na campanha têm `shopify_customer_id`. A tela cai no filtro por e-mail; o checkout é anônimo (sem `buyerIdentity`), então o e-mail digitado no checkout decide. Qualquer erro aparece como "Você ainda não tem pedidos". | validação GraphQL; SQL em `profiles`; `Pedidos.tsx:10-20`; `Carrinho.tsx:255-290` |
| Conflito de logins | Cliente de 05/10 criou conta `.com` e `.com.br`; e-mail de confirmação em inglês, sem reenvio; senha passada por WhatsApp. 3 usuários já têm identidade `email` + `google` (link automático funciona quando o e-mail é confirmado). | WhatsApp 05-06/10; `auth.identities` |
| Pedidos Getnet demoram e "expiram" | Cartão: #1012 e #1022 ficaram `SALE/PENDING` sem callback; viraram `PAID` por **transação manual** 33h e 10 dias depois. Pix: os 2 únicos `EXPIRED` do histórico (#1001, #1004) são Getnet Pix. Caso 09/10: dinheiro entrou na Getnet e **não existe pedido** na Shopify (#1023 foi lançado manualmente). O app Getnet não confirma pagamento à Shopify. | Admin API `transactions`; grupo "Jilo - suporte" 09/10 |
| Nada chega a `orders`/Uber desde 30/06 | Receiver recusa webhooks por HMAC (chave Antiga × Nova no cofre) desde v37 (14/09) e, antes disso, pedidos Getnet nunca disparam `orders/paid`. `orders` tem 7 linhas, última em 30/06. | SQL; `state.md:29` |

**Veredito "vale a pena?"** Sim para identidade + pedidos + perfil + endereços (elimina 2 edge functions, 2 tabelas de PII, o Supabase Auth e a raiz dos dois primeiros sintomas). Não para "tudo na Shopify": Flow no Basic não faz HTTP (Uber), nenhum app BR aceita voucher Alelo, e desconto automático por Pix não existe no Basic. Hydrogen não é necessário.

**Decisão de pagamento:** trocar Getnet por **Cielo** no checkout nativo (conector oficial Cielo para Shopify: cartão + Pix + boleto, Merchant ID/Key da API E-commerce já contratada em 08/10, EC 1012848067). Alelo continua integração própria via API Cielo, no molde da VR, gated.

---

## 2. Estado atual (evidências)

### 2.1 Loja Shopify (jnutg9-u2, Basic, BRL)
- Shopify Payments indisponível no Brasil → taxa de 2% por gateway terceiro no Basic (fonte terceira, confirmar na fatura).
- Contas de cliente: `OPTIONAL`; **0** clientes `ENABLED`, 10 `DISABLED` (todos guest). Sem duplicatas.
- Gateways no histórico: "Credit Credit Getnet", "Getnet Pix", "manual".
- Campanha (23/09→): **3 pedidos reais** (#1012, #1022, #1023 = R$ 583,54); 9 pedidos de teste VR cancelados. 3 checkouts abandonados.
- Apps de desconto: `PIX5` (ORDER, chega ao checkout desde R80), kits por Automatic Discount.

### 2.2 Supabase (hofohxvizlmawgkinwwz)
- `auth.users`: 34 (22 google, 12 email); 17 Google ativos na campanha.
- `profiles`: 34; `shopify_customer_id` em 6 (todos e-mail, anteriores à campanha); CPF em 2.
- `addresses`: 20 endereços, 13 usuários.
- `orders`: 7 linhas (última 30/06); `webhook_events`: 15 (última 30/06).
- "Meus pedidos" **não lê** `orders`: `customer-orders` consulta a Admin API por `shopify_customer_id` ou e-mail.
- `orders.user_id` nunca é preenchido pelo webhook.

### 2.3 Código (linhas)
| Área | Linhas |
|---|---|
| src/pages | 3.517 |
| src/components | 8.935 |
| src/hooks + lib + stores + config | 2.733 |
| supabase/functions | 8.697 (inclui VR e _hml) |

Arquivos que dependem exclusivamente do Supabase Auth: `AuthContext.tsx`, `googleAuth.ts`, `ProtectedRoute.tsx`, `AuthDialog.tsx`, `GoogleOneTap.tsx`, `GoogleLoginPopup.tsx`, `GoogleSignInButton.tsx`, `Login.tsx`, `Cadastro.tsx`, `Carrinho.tsx` (bloco pós-login), `Header.tsx`, `ContaSidebar.tsx`, `useProfile.ts`, `useAddresses.ts`, `useOrders.ts`, `DeliveryAddressSelector.tsx`, `Perfil.tsx`; edges `shopify-customer-sync`, `customer-orders`, `vr-checkout` (lê `profiles`).

### 2.4 Frentes externas
- **Cielo:** API E-commerce habilitada 08/10 (EC 1012848067, ramo 5411). Falta Merchant ID/Key de produção e análise cadastral do pedido P-DATPGQG45.
- **VR:** App no plano errado da Captura (sem escopos); DX sem resposta; Rosemary volta 20/10. Flag `VITE_VR_ENABLED=false`.
- **Alelo:** só via parceiro homologado (Cielo). Falta confirmação escrita de habilitação do EC. Interoperabilidade PAT prevista ~07/11/2026 (reavaliar dez/2026).
- **Getnet:** nenhum e-mail, contrato ou credencial de API no projeto.

---

## 3. O que a Shopify cobre (pesquisa nas docs, 2026-10)

| Hoje (Supabase) | Shopify | Cobertura | Observação |
|---|---|---|---|
| Supabase Auth + Google GSI | Customer accounts (novas) com código por e-mail, Google, Shop | Parcial | Login acontece na página hospedada da Shopify; SPA recebe token via OAuth PKCE (cliente público). Legacy accounts deprecadas em fev/2026. |
| `profiles` (nome, telefone) | `Customer` na Customer Account API | Total | |
| `profiles.cpf` | Campo nativo CPF/CNPJ no checkout BR (já obrigatório na loja) | Total p/ pedido | Fica no pedido, não no perfil. Metafield de cliente se precisar. |
| `addresses` (+ label) | `customer.addresses`, `defaultAddress` | Total | Label vira metafield ou é descartado. Validação de área continua no front. |
| `customer-orders` + `Pedidos.tsx` | `customer.orders` na Customer Account API ou páginas hospedadas `account.<loja>` | Total | |
| Checkout anônimo | `buyerIdentity.customerAccessToken` + `sso=silent` | Total | Resolve "e-mail diferente no checkout". |
| Webhook → Uber | Flow "Send HTTP Request" | Nenhuma no Basic (só Grow+) | Manter receiver + espelho. |
| Pix pendente que expira | Status nativo; sem cancelamento automático confirmado | Parcial | Flow (sem HTTP) consegue taguear + e-mail. |
| PIX5 cupom | Código de desconto | Total | Desconto automático por método: não no Basic. |
| SSO Supabase↔Shopify | Multipass / IdP próprio | Só Plus | Por isso a identidade tem que ir inteira para a Shopify. |
| Voucher Alelo/VR | Payments app | Nenhuma | Integração própria (molde VR). |
| Hydrogen/Oxygen | — | Desnecessário | Customer Account API funciona na SPA Vite atual. |

Fontes: shopify.dev/docs/api/customer/2026-10; shopify.dev/docs/storefronts/headless/building-with-the-customer-account-api/getting-started e /checkout-authentication; changelog "legacy customer accounts deprecated"; help.shopify.com/manual/customers/customer-accounts; help.shopify.com/manual/shopify-flow; docs.cielo.com.br/conectores/docs/integracao-shopify e /pix-shopify.

---

## 4. Arquitetura-alvo

```
Cliente ──login──▶ Shopify Customer Accounts (Google / código e-mail)
   │                    │ token (OAuth PKCE, cliente público)
   ▼                    ▼
SPA React/Vite ── Customer Account API ──▶ pedidos, perfil, endereços
   │
   ├── Storefront API: cart + buyerIdentity.customerAccessToken ──▶ checkout Shopify (logado)
   │                                                                 └─ gateway: Cielo (cartão, Pix)
   │
   └── Supabase Edge (mantido): uber-quote, update-shipping-variant-price,
       shopify-webhook-receiver → orders (espelho p/ Uber) → uber-create-delivery
       vr-checkout / cielo-checkout (Alelo) → draft order pago na Shopify
```

Sai do Supabase: `auth` de clientes, `profiles`, `addresses`, `shopify-customer-sync`, `customer-orders`, `order_status_history`, `kit_*`.
Fica: `orders` (só colunas de entrega), `webhook_events`, `shopify_admin_tokens`, `vr_transactions` (+ `cielo_transactions`), edges Uber/VR/frete/receiver.

---

## 5. EAP (3 níveis, regra 4-40)

```
0. Jilo — identidade, pedidos e pagamentos na Shopify  (total ≈ 204h)

  1. Estancar a sangria (produção, sem mudar arquitetura)            30h
    1.1 Vínculo cliente ↔ Shopify
      1.1.1 Corrigir shopify-customer-sync: trocar customerCreate(identifier) por
            busca `customers(query:"email:…")` + customerCreate/customerUpdate; backfill
            dos 34 perfis; log de erro visível                                   8h
      1.1.2 Pedidos.tsx/PedidoDetalhe: tratar isError (toast + retry); customer-orders
            cai para filtro por e-mail quando customer_id devolve 0               4h
    1.2 Checkout identificado
      1.2.1 cartBuyerIdentityUpdate com e-mail e telefone do usuário no handleCheckout
            (e no "Comprar agora"); teste Vitest                                  6h
    1.3 Webhooks vivos
      1.3.1 Revogar chave Antiga no Dev Dashboard (dono) + redeploy receiver v46;
            registrar orders/updated e orders/cancelled; aceitar expired/voided/
            authorized no CHECK de payment_status; marcar pedido expirado no espelho  8h
    1.4 Alerta operacional
      1.4.1 Shopify Flow (Basic): pedido criado → esperar 15 min → se pendente/expirado
            → tag `conferir-gateway` + e-mail interno; checklist da Julia            4h

  2. Pagamentos: Cielo substitui Getnet no checkout                   18h + gate externo
    2.1 Credenciais e conector
      2.1.1 Obter Merchant ID/Key (site Cielo); instalar plugins "Cielo Cartão" e
            "Cielo Pix"; acesso ao Cielo Payment App; webhook de notificação;
            parcelamento e antifraude conforme contrato                             6h
    2.2 Homologação
      2.2.1 Sandbox + 3 compras reais (cartão, Pix pago, Pix não pago); confirmar
            orders/paid, Uber, PIX5; desativar Getnet; conferir taxa de 2%           8h
    2.3 Comunicação
      2.3.1 FAQ/PixCallout/PaymentMethodSelector refletem Cielo; remover "PayPal"     4h

  3. Identidade e conta na Shopify (Customer Account API)             80h
    3.1 Configuração da loja
      3.1.1 Ativar customer accounts novas; login Google (Google Cloud); canal Headless;
            redirect/logout URIs HTTPS (prod + preview Lovable)                     6h
    3.2 Autenticação na SPA
      3.2.1 Módulo auth: discovery .well-known, PKCE, callback, refresh, logout;
            AuthContext passa a expor token da Shopify                              16h
      3.2.2 Remover GSI/One Tap/Login/Cadastro/AuthDialog; Header e ProtectedRoute
            usam o novo contexto; PostHog identify com customer id                  8h
    3.3 Área da conta
      3.3.1 Meus pedidos via Customer Account API (orders, lineItems, fulfillments,
            financialStatus); status "expirado" com texto próprio                   12h
      3.3.2 Perfil e endereços via Customer Account API (customerUpdate,
            customerAddressCreate/Update/Delete, default); label → metafield;
            CPF sai do perfil (checkout nativo já exige)                            12h
    3.4 Checkout logado
      3.4.1 buyerIdentity.customerAccessToken no cart + sso=silent; atributo
            selected_address_id passa a ser o id do endereço Shopify                8h
    3.5 Desacoplar webhook e VR do Supabase Auth
      3.5.1 Receiver resolve endereço via Admin API (customer + address id do
            atributo) em vez de `addresses`; vr-gates idem; telefone do cliente
            chega ao Uber                                                           10h
    3.6 Migração de dados
      3.6.1 Script: customerSet para os 34 perfis + endereços; e-mail "entre com
            código" aos clientes ativos; período de 2 semanas de dupla leitura       8h

  4. Alelo via API Cielo (integração própria, molde VR) — GATED        60h + gates
    4.1 Gates comerciais
      4.1.1 Confirmação escrita Alelo (EC habilitado, MDR ≤ 3,6%), produto Cielo
            (API E-commerce 3.0), Silent Order Post disponível, regra de cancelamento 6h
    4.2 Backend
      4.2.1 `_shared/cielo-client.ts` + tabela `cielo_transactions` (deny-all,
            único parcial por cart)                                                16h
      4.2.2 Edge `cielo-checkout` reutilizando vr-gates, storefront-cart,
            shopify-draft-order, cpf; estorno automático; idempotência              16h
    4.3 Frontend
      4.3.1 Opção "Alelo" sob flag VITE_ALELO_ENABLED; captura por SOP/hosted
            fields (sem PAN no backend)                                             12h
    4.4 Homologação
      4.4.1 fake-cielo + E2E local (molde `_hml`); sandbox Cielo; 5 cenários         10h

  5. Descomissionar e documentar                                       16h
    5.1 Limpeza
      5.1.1 Remover customer-orders, shopify-customer-sync, profiles, addresses,
            order_status_history, kit_*, Supabase Auth de clientes; resolver advisors
            (search_path, handle_new_user, leaked password)                        10h
    5.2 Documentação
      5.2.1 fluxo-autenticacao, fluxo-perfil-usuario, fluxo-carrinho-checkout,
            CLAUDE.md (Pix/cupom desatualizados), requirements.md                   6h
```

Regra do 100%: 1.x cobre os sintomas atuais; 2.x o gateway; 3.x a transposição pedida; 4.x a Cielo "neste estágio" (Alelo); 5.x o descarte do que ficou órfão.

---

## 6. Roadmap

| Sprint | Dias | Work packages | Entregável | Depende de |
|---|---|---|---|---|
| **Sprint 0 — Estancar** | 1–5 | 1.1.1, 1.1.2, 1.2.1, 1.3.1, 1.4.1 | Meus pedidos funciona para quem logou pelo Google; webhooks voltam a popular `orders`; Julia recebe alerta de pedido pendente | Dono revoga chave Antiga; publicar no Lovable |
| 🧹 Limpeza | 5 | codebase-cleanup | Docs de Pix/cupom corrigidas no CLAUDE.md | |
| **Sprint 1 — Cielo no checkout** | 6–10 | 2.1.1, 2.2.1, 2.3.1 | Cartão e Pix pela Cielo; Getnet desativada; pedido pago confirma em minutos | Merchant ID/Key da Cielo |
| **Sprint 2 — Identidade Shopify (parte A)** | 11–20 | 3.1.1, 3.2.1, 3.2.2, 3.4.1 | Login pela Shopify (Google/código), checkout logado; conta ainda lê perfil antigo | Canal Headless; URIs HTTPS |
| 🧹 Limpeza + project-docs-bootstrap | 20 | | | |
| **Sprint 3 — Identidade Shopify (parte B)** | 21–30 | 3.3.1, 3.3.2, 3.5.1, 3.6.1 | Pedidos, perfil e endereços 100% Shopify; webhook e VR sem `addresses`; clientes migrados | Sprint 2 |
| **Sprint 4 — Alelo via Cielo** | 31–40 (gated) | 4.1.1 → 4.4.1 | Alelo em homologação, flag desligada | Confirmação Alelo + sandbox Cielo |
| **Sprint 5 — Descomissionar** | 41–44 | 5.1.1, 5.2.1 | Supabase só com Uber/VR/Alelo/webhooks; docs atualizadas | 2 semanas de dupla leitura |

Multiplicador 1,5× já considerado nos pacotes com integração externa (2.x, 3.5, 4.x). VR (Captura) corre em paralelo e não bloqueia nada aqui.

---

## 7. Dados (Supabase depois da migração)

```sql
-- MANTIDA: orders — só o que a Uber e a operação precisam
-- Remover: customer_email, customer_name, cpf-like; manter customer_phone (Uber)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shopify_customer_id text,      -- vínculo pelo pedido, não por auth.uid()
  DROP COLUMN IF EXISTS user_id;                           -- auth.users deixa de existir p/ cliente
-- RLS: deny-all para anon/authenticated (só service_role escreve/lê)

-- NOVA (Sprint 4): cielo_transactions — espelho de vr_transactions
CREATE TABLE public.cielo_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id text NOT NULL,
  cielo_payment_id text UNIQUE,
  valor_cents integer NOT NULL CHECK (valor_cents > 0),
  status text NOT NULL CHECK (status IN ('authorizing','authorized','captured','refunded_auto','refund_failed','failed')),
  shopify_draft_order_id text,
  shopify_order_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.cielo_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all ON public.cielo_transactions FOR ALL TO anon, authenticated USING (false);
CREATE UNIQUE INDEX cielo_tx_live_cart ON public.cielo_transactions(cart_id)
  WHERE status IN ('authorizing','authorized');

-- REMOVIDAS (Sprint 5): profiles, addresses, order_status_history, kit_discount_tiers, kit_templates
-- Shopify passa a ser a fonte: Customer, addresses, metafield custom.address_label
```

Após cada migration: `get_advisors(type: security)`.

---

## 8. Prompts de kickstart (Sprint 0)

### PROMPT 1 — Corrigir o vínculo cliente ↔ Shopify
**Ferramenta:** Claude Code (`/feature-builder`) · **EAP:** 1.1.1 · **Duração:** 60–90 min

Contexto: `supabase/functions/shopify-customer-sync/index.ts` chama `customerCreate(input, identifier)`; `identifier` não existe na Admin API 2025-10 (validado), logo todo login devolve 502 e `profiles.shopify_customer_id` fica nulo (0 de 22 usuários Google).

Tarefa: (1) substituir por `customers(first:1, query:"email:<email>")`; se existir, `customerUpdate` (tags, nome, telefone) e gravar o id; senão `customerCreate(input)`; (2) retornar `{customerId, created|linked}`; (3) script Deno único em `_hml/backfill-customer-sync.ts` que itera `profiles` sem id e chama a mesma função; (4) teste Deno do ramo "já existe" com fetch mockado.

IMPORTANTE: não enviar CPF (R65); manter `_shared/shopify-admin-client.ts`; não tocar no receiver.

Critério: `select count(*) from profiles where shopify_customer_id is null` = 0 após o backfill; novo login Google grava o id em < 5 s.

### PROMPT 2 — Erro visível em "Meus pedidos" + fallback por e-mail
**Ferramenta:** Claude Code · **EAP:** 1.1.2 · **Duração:** 30–45 min

Contexto: `src/pages/conta/Pedidos.tsx:10-20` ignora `isError`; `customer-orders/index.ts:284-298` usa `customer_id:` e nunca cai para `email:`.

Tarefa: na função, se a busca por `customer_id` devolver 0 pedidos, refazer por `email:`; na página, renderizar estado de erro com botão "Tentar de novo" (`refetch`). Teste Vitest do componente com `isError`.

Critério: 502 simulado mostra erro, não "Você ainda não tem pedidos".

### PROMPT 3 — Checkout identificado
**Ferramenta:** Claude Code · **EAP:** 1.2.1 · **Duração:** 45–60 min

Contexto: `cartCreate` só envia `lines`; `handleCheckout` (`Carrinho.tsx:239-333`) grava atributos e abre `checkoutUrl`. Sem `buyerIdentity`, o e-mail digitado no checkout decide a qual cliente o pedido pertence.

Tarefa: adicionar `cartBuyerIdentityUpdate({email, phone, countryCode:"BR"})` em `src/lib/shopify.ts`; chamar no `handleCheckout` e no "Comprar agora" quando houver usuário; depois `refreshCartDetails()` antes de abrir a URL (R80). Teste em `checkoutUrl.test.ts` ou novo.

Critério: pedido de teste na Shopify nasce com `customer.email` = e-mail do login.

### PROMPT 4 — Webhooks vivos e pedido expirado no espelho
**Ferramenta:** Claude Code · **EAP:** 1.3.1 · **Duração:** 60–90 min · **Pré-requisito do dono:** revogar a chave Antiga do app `jiloapp` no Dev Dashboard.

Tarefa: (1) `register-shopify-webhooks`: adicionar `ORDERS_UPDATED` e `ORDERS_CANCELLED`; (2) receiver: handler `orders/updated` que atualiza `payment_status`/`status` (expired, voided → `cancelled`), sem disparar Uber; (3) migration ampliando o CHECK de `orders.payment_status` (authorized, voided, expired, partially_paid, partially_refunded); (4) `JSON.parse` dentro do try; (5) deploy + reenvio dos webhooks de #1022 e #1023 pelo Admin.

Critério: `orders` recebe #1022/#1023; pedido com `financial_status=expired` aparece `cancelled` no espelho.

### PROMPT 5 — Flow de alerta (sem código)
**Ferramenta:** Shopify Admin (Flow) · **EAP:** 1.4.1 · **Duração:** 30 min

Workflow: Trigger "Order created" → Wait 15 min → Condition `order.displayFinancialStatus` ∈ {PENDING, EXPIRED} → Add tag `conferir-gateway` + Send internal email (SAC). Documentar em `fluxo-carrinho-checkout.md` e entregar checklist de 3 passos à Julia (painel do gateway → marcar como pago → anotar).

---

## 9. Regras de negócio consolidadas (alimentam `requirements.md`)

1. Shopify Cart é o motor de preço: kits (Automatic Discount), `PIX5` (ORDER, incide no frete), frete por variante fantasma; o front só espelha `cart.cost.totalAmount`.
2. Produtos ficam `requiresShipping:false` (Path B); endereço de entrega vai por atributo do cart e é resolvido no webhook.
3. Frete grátis ≥ 7 marmitas; abaixo, cotação Uber (raio ~5 km) ou Lalamove R$ 19,90 fora do raio.
4. CPF é exigido no checkout (campo nativo); nunca persistido fora da Shopify.
5. Pedido só gera entrega Uber no `orders/paid`. Pedido `pending`/`expired` nunca despacha.
6. Todo pedido Getnet/Cielo pendente > 15 min é conferido no painel do gateway antes de marcar pago.
7. VR e Alelo cobram fora do checkout e criam draft order pago na Shopify, com tag própria (`vr`, `alelo`); `PIX5` vale para VR (G1); para Alelo, a decidir.
8. Cancelamento de voucher Alelo via Cielo só em D0 e total.
9. RLS: toda tabela `public` com RLS e `TO` explícito; tabelas só de backend deny-all.
10. Uma identidade por cliente: a da Shopify. Supabase não guarda mais PII de cliente após o Sprint 5.

---

## 10. Pontos a validar com o dono (briefing por evidência, não por entrevista)

| # | Pergunta | Recomendação Fainow | Por quê |
|---|---|---|---|
| 1 | Trocar Getnet por Cielo no checkout nativo, ou manter Getnet e só adicionar Cielo? | **Trocar.** Getnet desativada após 3 compras de teste na Cielo. | Dois gateways de cartão = dois painéis para conferir; a Getnet já provou que não confirma. Guardar Getnet para a maquininha. |
| 2 | Login do cliente passa para a Shopify (perde a tela de login própria; Google continua)? | **Sim.** | Única forma de ter checkout logado e pedidos nativos sem Plus. Tela de login hospedada é aceitável para e-commerce de marmitas. |
| 3 | Manter página "Meus pedidos" no site (via API) ou usar `account.jilomarmitas.com` pronta? | **Via API no site** (3.3.1). | Mantém a UX e os textos de status (expirado, Uber). A hospedada é o fallback de 1 dia se o prazo apertar. |
| 4 | Alelo entra agora (Sprint 4) ou espera a interoperabilidade PAT (nov/dez 2026)? | **Esperar os gates** (4.1.1) e reavaliar em dez/2026; não bloqueia Sprints 0–3. | Sem confirmação escrita da Alelo o código fica parado; a interoperabilidade pode tornar a Getnet/Cielo da maquininha suficiente. |
| 5 | Subir para plano Grow (Flow com HTTP, taxa 1%)? | **Não agora.** | Com ~3 pedidos/semana o ganho não paga; reavaliar com volume. |
| 6 | Desconto Pix: manter cupom `PIX5` manual? | **Manter.** | Desconto automático por método não existe no Basic; cupom já chega ao checkout (R80). |
| 7 | Quem revoga a chave Antiga do app e publica no Lovable? | Antônio, hoje. | Sem isso, Sprint 0 não entrega webhooks nem `orders`. |

---

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Cielo demora a liberar Merchant Key / análise cadastral (P-DATPGQG45) | Sprint 1 só depois da chave; Sprint 0 e 2 não dependem. Cobrar Cielo com nº do pedido. |
| Clientes existentes (34) estranham "entre com código" | E-mail + aviso no site por 2 semanas; dupla leitura (perfil antigo como fallback) até o Sprint 5. |
| Customer Account API exige HTTPS no callback; preview do Lovable | Registrar URIs de prod e de preview; dev local via ngrok. |
| Taxa de 2% por gateway terceiro no Basic | Confirmar na fatura; é igual para Getnet ou Cielo. |
| Senhas e 2FA trafegando no WhatsApp (05–06/10) | Com login da Shopify não há senha; orientar Julia a nunca enviar senha; trocar a da cliente. |
| Receiver HMAC volta a quebrar numa rotação de chave | Sonda `_hml/hmac-probe.ts` no runbook; alerta Flow cobre o buraco. |

---

## 12. Próximos passos — ciclo de vida

### Sequência pós-planejamento
1. ⬜ Dono: revogar chave Antiga do app; obter Merchant ID/Key Cielo; responder os 7 pontos da seção 10.
2. ⬜ `/feature-builder` → "executa o Sprint 0 da EAP de migração Shopify" (prompts 1–5).
3. ⬜ `codebase-cleanup` (corrigir CLAUDE.md sobre Pix/cupom/tabelas de pedido).
4. ⬜ Sprint 1 (Cielo) assim que a chave chegar.
5. ⬜ Sprints 2–3 com `/feature-builder`; `project-docs-bootstrap` após o Sprint 2.
6. ⬜ Sprint 4 só após gate 4.1.1; Sprint 5 após 2 semanas de dupla leitura.

### Visão do ciclo
1. ⬜ Discovery — substituído por levantamento de evidência (esta sessão)
2. ✅ Planejamento (este documento)
3. ⬜ Construção Sprint 0
4. ⬜ Limpeza
5. ⬜ Documentação
6. ⬜ Iteração (feature-builder por sprint)

---

## Apêndice — fontes da sessão (2026-10-09)
- Relatórios dos sub-agentes (scratchpad): exp-auth, exp-orders, exp-profile, exp-cart, exp-payments, exp-uber, exp-schema, exp-catalog-state, shopify-docs, shopify-live, gmail-contexto, wa-casos, sb-consulta.
- Consultas diretas: `auth.users`/`profiles`/`orders` via MCP Supabase; `validate_graphql_codeblocks` (Admin 2025-10) para `customerCreate(identifier)`.
- Conversas: grupo "Jilo - suporte" (06–09/10), DM Julia Viana (03/09–06/10).
- E-mails: Cielo (08/10), VR (28/08–08/10), Alelo via HugMe (31/08).
