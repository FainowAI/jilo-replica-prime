# ADR 0001 — Cielo: conector no checkout + Alelo via API própria

**Data:** 2026-10-12 · **Status:** aceita (Antônio)

## Contexto
A Getnet não confirma pagamentos à Shopify (#1012, #1022 pendentes por dias; #1025 de 12/10 aprovado na Getnet e "Expirado" na Shopify). O Luiz contratou Cielo E-commerce (EC 1012848067, 08/10) para aceitar Alelo, que só integra online via parceiro homologado (Adyen, Yuno ou Cielo). Nenhum app de pagamento BR para Shopify aceita voucher.

## Decisão
1. Cartão de crédito e Pix: conector oficial Cielo ("Cielo Creditcard", "Cielo Pix") no checkout nativo da Shopify, substituindo a Getnet após 3 compras teste.
2. Alelo: integração própria no molde da VR — `cielo-checkout` cobra fora da Shopify (API E-commerce 3.0, `DebitCard`/`Elo`), cria e completa draft order pago; cartão capturado por Silent Order Post (sem PAN no backend); `cielo_transactions` para idempotência; `cielo-reconcile` para pendências; flags `VITE_ALELO_ENABLED`/`ALELO_ENABLED` desligadas até homologar.

## Consequências
- Um único par MerchantId/MerchantKey é compartilhado entre o conector Shopify e a nossa edge: rotação exige atualizar os dois juntos.
- Cancelamento Alelo só total e no D0 → o fluxo verifica o draft antes de anular e o reconcile prioriza o corte do dia.
- A documentação da Cielo é contraditória sobre SOP com voucher: se o sandbox negar, a decisão volta para o dono (sem cair para PAN no servidor).
- Supabase segue responsável por VR, Alelo, Uber e webhooks (alinhado à EAP `eap_migracao_shopify_jilo_fainow.md`).
