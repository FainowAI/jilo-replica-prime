# EAP — Pagamento com VR (Vale Refeição) no site da Jilo

**Status:** PLANEJADO (2026-09-11) — nenhum código escrito. Plano para execução por tickets (`.claude/.work/pagamento-vr/tickets/_map.md`).
**Origem:** pedido do dono do produto — "quando a pessoa selecionar VR, usar o sistema da VR como gateway; não usar Getnet nesse caso".
**Fontes desta EAP:** portal do desenvolvedor da VR (`dev.vr.com.br`, conta `luiz@dajuhalimentacao.com.br`, lido em 2026-09-11) + mapas de código em `.claude/.work/pagamento-vr/` (`code-map-frontend.md`, `code-map-backend.md`, `code-map-regras.md`, `vr-api-notes.md`).

---

## 1. Resumo executivo

Hoje 100% do pagamento acontece no **checkout hospedado da Shopify** (R18). O site já **promete** "Pague com seu VA ou VR" (home `VaVrSection.tsx` + banner global `AnnouncementBar.tsx`), mas não existe nenhuma implementação — o seletor de pagamento do carrinho só tem `pix | credit | paypal`, todos terminando no mesmo redirect Shopify.

A VR Benefícios expõe a **API Captura 2.4.0** (família Adquirência) — pagamento online com cartão VR (número, validade, CVV, nome, documento) ou cartão tokenizado, com criptografia RSA por chave pública. É uma API **síncrona** (autoriza na hora, sem webhook) e o valor é em **centavos**. A API de QR Code da VR é do lado de quem *paga* (app do beneficiário), **não serve** para o EC gerar cobrança — descartada.

**Desenho escolhido (o mais curto que fecha o ciclo):**
- O **Shopify Cart continua sendo o motor de preço** (Kit automático, cupons, linha fantasma de frete). Ninguém reimplementa desconto.
- Quando o cliente escolhe VR, o frontend coleta o cartão, **criptografa no navegador** com a chave pública da VR e chama uma Edge Function `vr-checkout`.
- `vr-checkout` relê o cart **do lado do servidor** (Storefront API), valida os gates de negócio, cobra na VR (`POST /transacoes/pagamentos`) e, aprovado, **cria o pedido na Shopify** via `draftOrderCreate` + `draftOrderComplete` (caminho já validado empiricamente no pedido de teste #1005, `state.md` 2026-06-30).
- A partir daí **nada muda**: os webhooks `orders/create`/`orders/paid` já existentes populam `orders`/`order_items`, resolvem endereço (Path B via `selected_address_id`), disparam Uber (`uber_quote_id`) e o pedido aparece em `/conta/pedidos` e no Admin Shopify.
- Getnet/checkout custom **não entra** neste escopo. Cartão/Pix continuam no checkout Shopify.

O que é novo: 1 tabela (`vr_transactions`), 1 helper compartilhado (`_shared/vr-client.ts`), 2 Edge Functions (`vr-public-key`, `vr-checkout`), 1 opção no `PaymentMethodSelector`, 1 formulário de cartão, 1 rota `/pedido-confirmado`, 1 evento de analytics, docs.

---

## 2. O que a VR oferece (fatos do portal — detalhe completo em `vr-api-notes.md`)

### 2.1 Autenticação — OAuth 2.0 "Authorization Code" server-to-server
1. `POST {oauth}/oauth/grant-code` body `{client_id, redirect_uri:"http://localhost/"}` → `{redirect_uri:"http://localhost/?code=<code>"}`
2. `POST {oauth}/oauth/access-token` header `Authorization: Basic base64(client_id:client_secret)` body `{grant_type:"authorization_code", code}` → `{access_token, refresh_token, expires_in:3600}`
3. Toda chamada: headers `client_id` + `access_token`. Refresh com `grant_type:"refresh_token"`.

`client_id`/`client_secret` nascem de uma **APP cadastrada em "Minhas Apps"** no portal. **Hoje a conta da Jilo não tem nenhuma APP** (lista vazia) — é o primeiro bloqueio.

### 2.2 API Captura 2.4.0 (usar esta; a 1.3.0 não tem chave pública/tokenização)
| Ambiente | Base |
|---|---|
| Sandbox/mock (dados fictícios fixos) | `https://api-devportal.vr.com.br/captura/v2` |
| Homologação | `https://api-hmp.vr.com.br/captura/v2` |
| Produção | `https://api.vr.com.br/captura/v2` |

Endpoints que o plano usa:
- `GET /chaves/chave-publica` → `{key_id, public_key(base64)}` (escopo `AC_GET_chave-publica`)
- `POST /transacoes/pagamentos` body `Transacao` → 201 `TransacaoAutorizada {id_transacao, valor, codigo_retorno, codigo_autorizacao, mensagem}`
- `GET /transacoes/pagamentos/{id}` (aceita nosso `id_transacao_van`) → `ConsultaTransacao {status: PENDENTE|CONFIRMADA|CANCELAMENTO_PENDENTE|CANCELADA|NEGADA}`
- `POST /transacoes/pagamentos/{id}/estornos` body `{valor, id_filiacao}`
- (upgrade path) `POST /transacoes/pagamentos/reservas` + `PATCH …/reservas` `{acao: efetivar|cancelar}` — pré-autorização em duas fases.

`Transacao`: `valor*` (centavos), `id_filiacao*` (código de afiliação do EC, ≤15), `id_transacao_van` (nosso id externo, ≤15 — idempotência), `quantidade_parcelas`, e o cartão por **uma** de três vias: `cartao_token_id` | `key_id` + `cartao_dados_criptografados` (RSA + base64) | `cartao {nome*, numero_cartao*(16), data_expiracao*(AAMM), cvv*(3), documento}`.

`codigo_retorno` relevantes para UX: `00` aprovado · `16` saldo insuficiente · `03` expirado · `04` bloqueado · `63` inválido · `95` CVV inválido · `97` validade inválida · `17` duplicidade · `60`/`67` valor fora do limite · `D0` acima do limite diário · `C2`/`C3` regra de rede fechada · `01`/`10` EC não cadastrado/inativo (erro nosso, não do cliente).

### 2.3 Pré-condições fora do código
- **EC credenciado com `id_filiacao`** (comercial VR, não vem do portal). Confirmar com o contato VR (fpierro@vr.com.br) se a afiliação atual (POS) vale para **transação online/VAN** ou se precisa de afiliação e-commerce.
- **APP de Homologação** aprovada pela VR (fluxo interno, não automático) marcando **OAuth 2.3.0** + **API de Captura 2.4.0**. Depois **APP de Produção** separada (informa o client_id da HML).
- **Formato do `cartao_dados_criptografados` não está documentado** (padding RSA PKCS#1 v1.5 vs OAEP; plaintext = JSON do objeto `cartao`?). O SDK "Criptografia AES" do portal é de outra família. → resolver no spike (ticket 01) contra o mock e/ou perguntar ao contato VR.

---

## 3. O que o código de hoje impõe (fatos dos mapas)

| Fato | Consequência para o desenho |
|---|---|
| `handleCheckout` (`Carrinho.tsx`) só grava note_attributes (`selected_address_id`, `delivery_method`, `uber_quote_id`/`delivery_label`, `return_url`) e abre `checkoutUrl` | O `vr-checkout` recebe os mesmos dados e os passa como `customAttributes` do draft order — o webhook lê exatamente esses nomes. |
| `canCheckout` (endereço atendido + frete resolvido + múltiplo de 7 + linha fantasma coerente) só existe no `/carrinho`; "Comprar agora" do produto não tem gate | VR só no `/carrinho` (decisão G2). Gates **replicados no servidor** dentro do `vr-checkout` (não confiar no cliente). |
| `displayTotal` é só visual; PIX 5% é cupom `PIX5` classe ORDER; Kit é automatic discount de linha; cupom manual só reflete no checkout | Valor a cobrar = `cart.cost.totalAmount` lido **no servidor** via Storefront `cart(id)`. PIX5 é **aplicado** ao escolher VR (G1: VR tem os mesmos 5% do Pix). |
| `PaymentMethodSelector` já é declarativo (`PAYMENT_METHODS`) e tem `onMethodChange` não consumido | Adicionar `"vr"` e ligar `onMethodChange` ao `Carrinho`. |
| `customer-orders` lê a Shopify **ao vivo**; `orders` local não alimenta "Meus Pedidos" | O pedido VR **precisa existir na Shopify** → draft order (caminho a). Inserir só em `orders` (caminho b) está descartado. |
| `draftOrderCreate`+`draftOrderComplete(paymentPending:false)` já disparou `orders/create`+`orders/paid` com HMAC ok (#1005); app customizado tem `write_orders`/draft | Reusar `_shared/shopify-admin-auth.ts` + padrão `callShopifyAdmin` (retry 401). |
| `uber-create-delivery` exige `uber_quote_id` + `shipping_address.address1/city`; webhook resolve endereço por `selected_address_id` | Passar ambos como customAttributes. **Verificar no sandbox** que `customAttributes` do draft viram `note_attributes` do pedido. |
| `orders.payment_method` = `payment_gateway_names[0]` | Draft completado sem gateway vira "manual". Passar `payment_method=vr` em customAttribute e fazer o receiver preferi-lo (1 linha). Alternativa: `draftOrderComplete(paymentGatewayId)` apontando para um "Manual payment method" chamado "VR Benefícios" criado no Admin — testar; se funcionar, dispensa a mudança no receiver. |
| `profiles.cpf` é texto livre sem validação (R7), não lido no checkout | Formulário VR pede/valida CPF (dígito verificador, sem lib) pré-preenchido do profile. |
| Edge Functions: auth manual de JWT (client anon + header repassado), `verify_jwt:false`, sem PII em log, idempotência via `webhook_events` UNIQUE | `vr-checkout` segue o mesmo padrão. |
| Não há testes de carrinho/checkout; MCP Supabase caiu durante o mapeamento (schema reconstruído de `types.ts` + migrations) | Cada ticket deixa um check runnable. Ticket 02 confere o schema vivo antes da migration. |
| Whitelist de CEP é só aviso (não bloqueia) | `vr-checkout` **bloqueia** fora de área (dinheiro real; decisão G7). |

---

## 4. Gate de regras de negócio — CONFIRMADO em 2026-09-11 pelo dono do produto

**Resultado:** G2 a G10 confirmados exatamente como recomendado. **G1 ajustado:** o desconto de 5% do Pix **vale também para VR** (Kit e cupom manual continuam valendo). Consequência no desenho: ao escolher VR o frontend **aplica** o cupom `PIX5` (mesma mecânica do Pix) e o `vr-checkout` **garante** que ele está aplicado antes de cobrar — o achado A2 da auditoria deixa de ser risco (ver §6). Reusar o código `PIX5` é a opção sem configuração nova; se a operação quiser distinguir nos relatórios, criar um `VR5` idêntico no Shopify Admin é um passo do ticket 02.

| # | Pergunta | Decisão |
|---|---|---|
| G1 | Desconto PIX (5%) vale para VR? Cupom manual (BEMVINDO10) vale? Kit vale? | **Sim para os três.** VR recebe os mesmos 5% do Pix (cupom `PIX5` aplicado ao escolher VR). Kit e cupom manual vêm do cart Shopify; o valor cobrado é o `totalAmount` do cart. |
| G2 | VR disponível no "Comprar agora" da página de produto? | **Não** — só em `/carrinho`, onde existem endereço, frete e gates. |
| G3 | CPF obrigatório para pagar com VR? | **Sim** — é o `documento` do titular e viaja **só dentro do blob criptografado**. Pré-preenche de `profiles.cpf`; **não grava de volta** (o titular do cartão pode não ser o usuário — auditoria M4). Validação por dígito verificador. |
| G4 | Guardar cartão / tokenizar (`POST /cartoes`) para compras futuras? | **Não na v1.** Nada de dado de cartão em banco ou log. Tokenização é upgrade path. |
| G5 | Pagamento aprovado na VR mas criação do pedido Shopify falhou — o que fazer? | **Draft order antes da cobrança** (auditoria A1): cria o draft, confere o total, cobra na VR e só então completa. Falha antes de cobrar não envolve dinheiro; falha só no `draftOrderComplete` ⇒ **estorno automático** (`refunded_auto`) + mensagem "não conseguimos concluir, o valor foi estornado". Invariante: ou cobra E cria pedido, ou nenhum. Reserva/efetivação em 2 fases é o upgrade path. |
| G6 | Marketing já promete Alelo/Sodexo/VR/Ticket/Flash | Ajustar para **"VR"** (Refeição/Alimentação) e remover as outras bandeiras (ou "em breve") no ticket de produção. |
| G7 | Área de entrega: bloquear fora da whitelist no VR? | **Sim** — o servidor recusa endereço fora de área (hoje é só aviso). |
| G8 | Estorno/cancelamento operacional (pedido cancelado depois de pago) | v1: fora do escopo do fluxo automático; ticket 08 cria `vr-refund` protegida por service key para a operação. |
| G9 | Parcelas | Sempre `quantidade_parcelas: 1`. |
| G10 | Quem opera o portal VR (criar APP, aprovação, id_filiacao) | Luiz (dono da conta) com apoio do Antônio — ticket 00. |

---

## 5. Arquitetura alvo

### 5.1 Fluxo (happy path)
```
[/carrinho] seleciona "VR" → PaymentMethodSelector.onMethodChange('vr')
   → aplica o cupom PIX5 e mostra o badge de 5% (G1: VR tem o mesmo desconto do Pix; mesma mecânica do Pix)
   → botão "Pagar com VR" (substitui "Ir para o Checkout"; canCheckout continua valendo)
   → <VrCardDialog> (react-hook-form + zod): nome, número (16), validade MM/AA, CVV, CPF
   → invoke('vr-public-key') → {key_id, public_key}   (cacheada ~10 min no cliente)
   → criptografa {nome, numero_cartao, data_expiracao(AAMM), cvv, documento} com RSA no navegador
   → invoke('vr-checkout', { cartId, selectedAddressId, deliveryMethod, uberQuoteId|deliveryLabel,
                             keyId, cardEncrypted })            (sem cpf/cartão em claro — zod recusa)

[vr-checkout]  (Edge Function, verify_jwt:false + validação manual do JWT → user.id/email)
   1. JWT → rate limit por usuário (≥5 recusas/15 min ⇒ 429) → breaker global (≥X recusas/10 min ⇒ 503)
   2. cart = Storefront `cart(id)` (server-side, token público): lines, cost.totalAmount, discountCodes
   3. gates: currency BRL e total > 0; garante PIX5 aplicado (se faltar, cartDiscountCodesUpdate server-side
      e relê o cart — G1); endereço ∈ addresses do user
      + área atendida; múltiplo de 7 (≥7); estrutura da linha fantasma (<7 ⇒ 1 linha, qty 1, preço > 0;
      lalamove ⇒ preço fixo; ≥7 ⇒ nenhuma). cartId não é provado como do usuário (risco aceito B5).
   4. valor = round(totalAmount * 100)   (inclui Kit, os 5% do PIX5, cupom manual que a Shopify combine, e frete)
   5. INSERT vr_transactions ('authorizing', id_transacao_van ≤15 chars) ANTES de qualquer chamada externa
      — unique parcial em (cart_id) where status in ('authorizing','approved'):
        23505 + linha 'approved' ⇒ 200 com o mesmo pedido (idempotente)
        23505 + 'authorizing' recente ⇒ 409 "pagamento em andamento"
        23505 + 'authorizing' velha (>N min) ⇒ resolve via GET /transacoes/pagamentos/{id_transacao_van}
   6. draftOrderCreate { lineItems (variantId, quantity — SEM desconto por linha),
        UM appliedDiscount FIXED_AMOUNT de ordem = soma de TODAS as alocações do cart (Kit por linha +
        PIX5/cupom por ordem — copiar VALORES, nunca códigos; o FIXED_AMOUNT por linha da Admin API é
        POR UNIDADE, medido em 2026-09-14), acceptAutomaticDiscounts:false, email/customerId do JWT/profile,
        shippingAddress (do addresses), tags ['vr' (+ 'vr-test' fora de prod)],
        customAttributes: selected_address_id, delivery_method, uber_quote_id|delivery_label (omitido fora
        de prod), vr_id_transacao, vr_codigo_autorizacao }
      assert draft.totalPrice*100 == valor  (fecha Kit/cupom/frete)  → grava shopify_draft_order_id
   7. VR POST /transacoes/pagamentos {valor, id_filiacao, id_transacao_van, quantidade_parcelas:1,
                                       key_id, cartao_dados_criptografados}   (timeout 30 s, SEM retry)
      codigo_retorno ≠ '00' → 'declined' (guarda codigo) → 402 {code, userMessage}
      timeout/rede → GET pela id_transacao_van: CONFIRMADA ⇒ segue; NEGADA ⇒ declined; PENDENTE ⇒ 409
   8. draftOrderComplete(paymentPending:false | paymentGatewayId manual "VR Benefícios")
      — só roda com vr_codigo_retorno = '00' gravado; falha ⇒ refund() ⇒ 'refunded_auto' ⇒ 502
   9. UPDATE tx 'approved' (shopify_order_id, order_name) → 200 { orderName }

[frontend] clearCart() → navigate('/pedido-confirmado', { state: { orderName } }) → track('pagamento concluído', {metodoPagamento:'vr', itens, total})

[Shopify → webhooks existentes] orders/create + orders/paid → orders/order_items → endereço (Path B) → Uber dispatch
[Cliente] /conta/pedidos (customer-orders lê Shopify) mostra o pedido normalmente.
```

### 5.2 Componentes novos / alterados
| Camada | Item | Novo/Alterado | Padrão a copiar |
|---|---|---|---|
| DB | `public.vr_transactions` | novo | RLS de `orders` (SELECT own `TO authenticated`; escrita só service_role) |
| Edge `_shared` | `vr-client.ts` (OAuth grant→token→refresh + cache; `getPublicKey`, `pay`, `refund`, `getTransaction`) | novo | `shopify-admin-auth.ts` |
| Edge | `vr-public-key` (proxy autenticado de `GET /chaves/chave-publica`) | novo | `customer-orders` (auth manual JWT) |
| Edge | `vr-checkout` | novo | `customer-orders` + `shopify-webhook-receiver` (callShopifyAdmin) |
| Edge | `shopify-webhook-receiver`: `payment_method` prefere note_attribute `payment_method` | 1 linha | — |
| Edge (v1.1) | `vr-refund` (guard service key) | novo | `uber-create-delivery` (bearer exato) |
| Front | `PaymentMethodSelector.tsx`: opção `vr`; `PaymentMethod` ganha `"vr"` | alterado | array `PAYMENT_METHODS` |
| Front | `Carrinho.tsx`: consome `onMethodChange`; botão "Pagar com VR"; ramo `handleVrCheckout` | alterado | `handleCheckout` |
| Front | `components/VrCardDialog.tsx` + `lib/vr/{cpf.ts,rsa.ts}` | novo | `AddressFormDialog` (dialog + form) |
| Front | `pages/PedidoConfirmado.tsx` + rota `/pedido-confirmado` | novo | `NotFound`/páginas simples |
| Analytics | `events.ts`: `pagamento concluído {metodoPagamento, itens, total}` | novo | `checkout iniciado` |
| Marketing | `VaVrSection.tsx`, `AnnouncementBar.tsx` copy | alterado | — |
| Docs | `.claude/fluxo-pagamento-vr.md`, `requirements.md` R79+, `CLAUDE.md` | novo | doc-sync |

### 5.3 Tabela `vr_transactions` (blueprint — confirmar contra o banco vivo no ticket 02)
```sql
create table public.vr_transactions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references auth.users(id) on delete set null,   -- nullable: exclusão de conta (LGPD) anonimiza
  cart_id                text not null,                    -- gid do Shopify Cart
  id_transacao_van       text not null unique check (char_length(id_transacao_van) <= 15),
  vr_id_transacao        text,                             -- id retornado pela VR
  vr_codigo_retorno      text,
  vr_codigo_autorizacao  text,
  valor_cents            integer not null check (valor_cents > 0),
  status                 text not null default 'authorizing'
    check (status in ('authorizing','declined','approved','refunded_auto','refund_failed','refunded_manual','error')),
  shopify_draft_order_id text,
  shopify_order_id       text,
  shopify_order_name     text,
  error                  text,                             -- só código interno + status HTTP, nunca corpo/PII
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
alter table public.vr_transactions enable row level security;
-- tabela só de backend (padrão webhook_events): nenhuma tela lê; service_role ignora RLS
create policy "vr_transactions_deny_client" on public.vr_transactions
  for all to anon, authenticated using (false) with check (false);
-- idempotência no banco: um cart só pode ter UMA transação viva (C1 da auditoria)
create unique index vr_transactions_one_live_per_cart
  on public.vr_transactions (cart_id) where status in ('authorizing','approved');
create index vr_transactions_user_recent on public.vr_transactions (user_id, created_at desc);  -- rate limit
```
**Nunca** armazena número de cartão, últimos 4, BIN, CVV, validade, nome impresso, blob criptografado, CPF ou IP. Reusar o trigger de `updated_at` existente (`profiles`/`addresses`).

### 5.4 Segredos (Supabase Edge Function Secrets)
`VR_CLIENT_ID`, `VR_CLIENT_SECRET`, `VR_ID_FILIACAO`, **`VR_ENV ∈ {mock, hml, prod}`** (hosts hardcoded no `vr-client.ts`; enum em vez de URL livre evita produção apontando para o mock — auditoria A5). Já existem: `SHOPIFY_*`, `SUPABASE_SERVICE_ROLE_KEY` (formato `sb_secret_…`), `SHOPIFY_SHIPPING_VARIANT_ID`. Rotacionar os três secrets pendentes (`SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_CLIENT_SECRET`, `UBER_CLIENT_SECRET`, pendência de 2026-06-28) antes de adicionar `VR_CLIENT_SECRET` ao mesmo cofre.

---

## 6. Segurança — auditoria do desenho (2026-09-11, `security-auditor`; relatório completo em `.claude/.work/pagamento-vr/security.md`)

Resultado: 2 CRÍTICOS, 5 ALTOS, 6 MÉDIOS, 5 BAIXOS — **todos já incorporados** no fluxo (§5.1), no schema (§5.3), nos segredos (§5.4) e nos critérios de aceite dos tickets. O que cada um mudou:

| Sev | Achado | Correção adotada | Ticket |
|---|---|---|---|
| CRÍTICO C1 | Idempotência por SELECT→INSERT era TOCTOU: duplo clique / duas abas cobrariam duas vezes | **Unique parcial** `(cart_id) where status in ('authorizing','approved')` + INSERT antes de qualquer chamada externa; `23505` devolve a linha viva | 02, 03 |
| CRÍTICO C2 | Função morrer entre cobrar e registrar deixava dinheiro sem pedido; retry cego duplicaria | `pay()` com timeout 30 s e **sem retry**; em timeout, `GET /transacoes/pagamentos/{id_transacao_van}` resolve; breadcrumbs por passo; linha `authorizing` velha é reconciliada | 01, 03, 08 |
| ALTO A1 | "Cobra → cria draft" transformava toda falha do draft em estorno | **Draft antes da cobrança**: create → assert total → pay → complete; só `draftOrderComplete` pode falhar com dinheiro em jogo | 03 |
| ALTO A2 | Cliente pode reaplicar `PIX5` via Storefront e pagar 5% a menos | **Superado pelo gate G1 (2026-09-11): VR tem os mesmos 5%.** O servidor passa a *garantir* o `PIX5` aplicado (`_shared/pix-coupons.ts` + `cartDiscountCodesUpdate` se faltar) e relê o cart; a asserção `draft.totalPrice == valor` continua fechando o valor; só o que a Shopify permitiu combinar entra no draft, copiando valores e nunca códigos | 03 |
| ALTO A3 | Formulário de cartão numa SPA com PostHog/gtag e sem CSP | `ph-no-capture` no dialog; `<meta CSP>` com allowlist de scripts; dados só em estado local; CVV `type=password`; nada de cartão em analytics | 04 |
| ALTO A4 | Endpoint vira oráculo de card testing (signup é livre) | Rate limit por usuário (5 recusas/15 min ⇒ 429) **+ breaker global** (X recusas/10 min ⇒ 503); gates baratos antes da VR | 03, 06 |
| ALTO A5 | URL livre em secret: prod apontando ao mock aprovaria tudo; HML criaria pedidos/Uber reais | `VR_ENV` enum; fora de prod: tag `vr-test` e **sem `uber_quote_id`** (receiver já não despacha) | 01, 03, 06, 07 |
| MÉDIO M1 | `user_id NOT NULL` + `ON DELETE SET NULL` bloqueava exclusão de conta | `user_id` nullable | 02 |
| MÉDIO M2 | Policy SELECT sem consumidor expunha autorização/erro | Tabela só de backend: **deny-all** para `anon`/`authenticated` | 02 |
| MÉDIO M3 | `error` receberia corpo de resposta (PII) | `error` = código interno + status HTTP; corpo nunca no banco/log | 03 |
| MÉDIO M4 | Gravar `documento` do cartão em `profiles.cpf` e mandar CPF em claro no body | CPF só dentro do blob; não grava de volta; payload sem `cpf` | 03, 04 |
| MÉDIO M5 | Chave pública cacheada "em algum lugar" | Cache em variável de módulo (cliente e servidor, TTL 10 min); `409 key_rotated` ⇒ refaz uma vez | 01, 04 |
| MÉDIO M6 | Linha fantasma de frete é manipulável (herdado: `update-shipping-variant-price` sem auth) | `vr-checkout` valida a **estrutura** da linha (qty/presença/preço fixo Lalamove); valor Uber segue confiado como no checkout Shopify — débito registrado fora da EAP | 03 |
| BAIXO B1 | `payment_method` por note_attribute é forjável | Preferir `draftOrderComplete(paymentGatewayId)` de um manual payment "VR Benefícios"; senão a **tag** `vr` no receiver; nunca só o note_attribute | 02, 03 |
| BAIXO B2 | `?n=<orderName>` vaza para analytics/Referer | `navigate('/pedido-confirmado', { state })`; evento sem `orderName` | 05 |
| BAIXO B3 | Token OAuth | Cache em módulo; `refresh_token` não persistido; renova no 401 uma vez | 01 |
| BAIXO B4 | CORS `*` e body sem schema | `zod` no servidor (sem campo `cartao`/`cpf` em claro, `cardEncrypted` ≤ 1 KB); origem restrita ao domínio | 03 |
| BAIXO B5 | `cartId` de qualquer cart é aceito (Storefront sem `buyerIdentity`) | Risco aceito: quem paga o cart alheio paga com o próprio cartão e recebe o próprio pedido; comentário `ponytail:` no código | 03 |

Invariantes que o código precisa provar (checks runnable dos tickets): **(i)** ou cobra E cria pedido, ou nenhum; **(ii)** dois requests paralelos para o mesmo cart ⇒ uma cobrança; **(iii)** nada de cartão fora do blob criptografado (banco, log, analytics, Shopify, URL); **(iv)** `draftOrderComplete(paymentPending:false)` só roda com `vr_codigo_retorno='00'` gravado.

Débitos herdados registrados (fora desta EAP): `update-shipping-variant-price` sem auth; `uber-webhook-receiver` sem assinatura; rotação de secrets pendente desde 2026-06-28; política de privacidade deve citar a VR como operadora do pagamento (ticket 07).

---

## 7. Riscos e mitigações
| Risco | Mitigação |
|---|---|
| Aprovação da APP pela VR demora / `id_filiacao` online não existe | Ticket 00 é o primeiro e corre em paralelo com o spike no mock (01), que não depende de aprovação se o mock aceitar a APP; se nem o mock liberar, o spike vira "cliente contra contrato" com testes unitários e a validação real fica no ticket 06. |
| Formato RSA do `cartao_dados_criptografados` indocumentado | Spike 01 testa PKCS#1 v1.5 e OAEP contra o mock; pergunta ao contato VR em paralelo. WebCrypto só faz OAEP — se for PKCS#1 v1.5, entra 1 dependência pequena (`node-forge`/`jsencrypt`) no frontend. Fallback extremo: `POST /cartoes` server-side (PAN transita em memória no Edge — amplia escopo PCI; evitar). |
| `customAttributes` do draft não virarem `note_attributes` | Verificado no ticket 03 (sandbox VR + Shopify real). Fallback: `vr-checkout` chama `orderUpdate` com `customAttributes` logo após `draftOrderComplete`, ou dispara `uber-create-delivery` direto. |
| Draft order não reproduz o desconto de Kit (automatic discount não roda em draft) | **Resolvido no 03 (2026-09-14):** um único `appliedDiscount` de ordem com a soma das alocações (linha + ordem) e `acceptAutomaticDiscounts:false`; `draftOrderCalculate` bateu exatos 126,29 no cart de teste. O `appliedDiscount` por linha foi descartado porque é por unidade e dividir quebra no arredondamento. O assert `draft.totalPrice == valor` pegou o problema ao vivo antes de qualquer cobrança. |
| Webhook `orders/*` sem assinatura era aceito quando `SHOPIFY_WEBHOOK_SECRET` estava vazio (herdado, fora da EAP) | Corrigido em 2026-09-14 (`shopify-webhook-receiver` v37 falha fechado, fallback `SHOPIFY_CLIENT_SECRET`). **Verificar no próximo pedido real**: se o receiver logar `Invalid HMAC signature`, definir `SHOPIFY_WEBHOOK_SECRET` com o signing secret dos webhooks (Shopify reenvia por 48 h). |
| Rate limit da Shopify (5 pedidos/min em `orderCreate` em planos básicos) | Draft order não tem esse limite explícito; volume da Jilo é baixo. |
| Token OAuth VR expira em 1h; Edge isolates são efêmeros | Cache em módulo + refresh; se o grant-code tiver limite, mover para tabela (`shopify_admin_tokens` como modelo, deny-all, sem `refresh_token`). |
| Só existe uma loja Shopify e um projeto Supabase: testes criam pedidos reais | Fora de prod o draft leva tag `vr-test` e não carrega `uber_quote_id` (sem despacho); QA cancela os pedidos `vr-test` ao final. |
| Cart Shopify expira entre cobrar e criar pedido | Cart é lido antes de cobrar; linhas ficam em memória; draft não depende do cart. |
| Promessa de marketing continua "furada" até o go-live | Ticket 07 ajusta copy; opcionalmente antecipar como hotfix de copy. |

---

## 8. Tickets (fatias verticais, uma sessão cada) — detalhe em `.claude/.work/pagamento-vr/tickets/`
| # | Ticket | Bloqueado por | Entrega demoável |
|---|---|---|---|
| 00 | Pré-requisitos externos VR (APP HML, aprovação, `id_filiacao`, formato RSA) | — | Credenciais HML em mãos; perguntas respondidas |
| 01 | Spike: `_shared/vr-client.ts` contra o mock (OAuth, chave pública, pagamento, consulta, estorno) | — (mock) | `deno test` verde chamando o mock; formato RSA decidido |
| 02 | Migration `vr_transactions` + tipos + secrets + `payment_method` por note_attribute | 01 | Tabela viva com RLS auditada (`get_advisors`) |
| 03 | Edge `vr-checkout` + `vr-public-key` (tracer bullet backend → draft order pago) | 02 | `curl` com cart real + cartão do mock cria pedido pago na Shopify e o webhook popula `orders` |
| 04 | Frontend: opção VR, `VrCardDialog`, criptografia, chamada, erros, `clearCart` | 03 | Compra VR ponta a ponta no site (mock) |
| 05 | `/pedido-confirmado` + evento `pagamento concluído` + masking | 04 | Tela de confirmação + evento no PostHog |
| 06 | Homologação: APP HML real, cartão de teste VR, roteiro de QA (Uber, endereço, Meus Pedidos, Admin) | 00, 05 | Checklist de QA assinado |
| 07 | Produção: APP prod, secrets, copy de marketing, docs (`fluxo-pagamento-vr.md`, R79+, `CLAUDE.md`, ADR) | 06 | VR ao vivo + memória do projeto atualizada |
| 08 | (v1.1) `vr-refund` operacional + reconciliação de `refund_failed`/`error` | 07 | Estorno manual por `order_name` via service key |

Tickets 00 e 01 são independentes e podem correr em paralelo. 03 e 04 são file-disjuntos mas 04 precisa da API de 03 no ar para demo — fazer em sequência.

---

## 9. Fora de escopo (explícito)
- Checkout custom com Getnet (segue como nota de roadmap em `state.md`, sem EAP).
- Outras bandeiras de benefício (Alelo, Sodexo/Pluxee, Ticket, Flash) — cada uma é outro gateway.
- Cartão salvo/tokenização, parcelamento, reserva em duas fases, desconto exclusivo VR.
- Estorno automático por cancelamento de pedido na Shopify (webhook `orders/cancelled` não registrado).
- Validação de assinatura do webhook Uber (débito já conhecido, independente).

---

## Apêndice A — Referências rápidas do portal VR
- Portal: https://dev.vr.com.br/api-portal/ · APIs Adquirência: `/content/apis/api-adquirencia` · Captura: `/content/apis/api-adquirencia/captura`
- Swagger Captura 2.4.0: https://dev.vr.com.br/api-portal/swagger/api-de-captura/2.4.0
- Autenticação padrão: https://dev.vr.com.br/api-portal/node/4
- Primeiros passos: `/content/primeiros-passos` · FAQ/Suporte: `/content/suporte` · Central de Suporte (Zendesk): `devvrbeneficios.zendesk.com`
- Minhas Apps: `/myapps` (vazio em 2026-09-11) · Cadastrar: `/myapps/new` · Dashboard sandbox: `/devdashboard`
- Contato VR da conta: fpierro@vr.com.br
