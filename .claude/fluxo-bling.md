# Fluxo: Bling (ERP / nota fiscal) ↔ Shopify

## Visão geral
O Bling recebe os pedidos da Shopify pela **integração nativa do próprio Bling** (Central de Extensões → "Jilo - e-com", código de loja API 206148783; criada por Antônio em 06/07/2026). Não há código do Bling neste repositório: as colunas `orders.bling_order_id` / `bling_nfe_id` existem desde a migration `20260408` e **nada lê nem escreve nelas**. Objetivo do Bling: emitir NFC-e/NF-e dos pedidos pagos (pedido do contador do Luiz, 08/10/2026 — tipo de documento ainda não confirmado).

## Configuração atual (conferida e ajustada em 2026-10-12)
- **Endereço:** a busca do CEP (necessária para validar o município) reescreveu bairro e logradouro com o texto dos Correios ("Conjunto Industrial Empresarial Eldorado", "Avenida Engenheiro Juarez de Siqueira Britto Wanderley") — mesmo endereço, grafia oficial.
- **Empresa** (`empresa.php`): JILO ALIMENTACAO LTDA, fantasia JILO ALIMENTACAO, CNPJ 05.574.020/0001-90, IE **isenta** (informado pelo Antônio em 12/10 — **validar com o contador/CADESP**: varejo em SP que emite NFC-e normalmente é contribuinte de ICMS com IE; emissor "ISENTO" pode ser rejeitado pela SEFAZ), CNAE 4712-1/00, Simples Nacional, São José dos Campos/SP (município IBGE 3549904). Antes estava "L. C. DA SILVA RESTAURANTE", sem CNAE e sem IE.
- **Pedidos** (Integração automática ATIVA, `configuracoes.integracoes.lojas.virtuais.php#edit/206148783/45`): Pago → Em aberto; Autorizado / Parcialmente pago → Em andamento; Pendente / Não pago / Anulado → Em digitação; Cancelado → Cancelado. Antes: "Todos → Em aberto" (o #1025 expirado entrou como #14 "Em aberto"). O Bling **atualiza** a situação do pedido já importado quando o status muda na Shopify (ajuda oficial "Pedidos de venda da Shopify": Pendente → Em andamento, depois Pago → Em aberto automaticamente) — Pix/cartão que confirmam depois saem de "Em digitação" sozinhos.
- **Produtos:** importa produtos e imagens da Shopify; **exportação de estoque DESLIGADA** (Shopify é mestre; AVS-001..007 estavam com 0 no Bling e zerariam a loja). Exportar imagens segue ligado.
- **Vendas:** data da venda; não importa observações; exporta status, notifica cliente e devolve estoque no cancelamento.
- **Meios de pagamento (12/10, aprovado pelo Antônio):** forma "Cartão de Crédito" criada (tipo fiscal Cartão de Crédito, bandeira Outros, pagamento não integrado, recebimentos) com alias **"Credit Credit Getnet"**; Pix com alias **"Getnet Pix"**. Quando o conector Cielo entrar, acrescentar os nomes de gateway da Cielo como aliases (conferir o nome exato em `payment_gateway_names` de um pedido real). Bandeira/integração/CNPJ da credenciadora: validar com o contador.
- **Produtos (25):** VEG-002..005, BOV-001..007, PXM-001..007, AVS-001..007; unidade "UN" (12/10); **NCM/CEST/tipo do item vazios** — decisão do contador.

## Bloqueios para emitir nota (ação humana)
1. Ativar o plano (tela "Ativação de conta": Cobalto R$ 60/mês, boleto) — hoje "funcionalidades reduzidas".
2. Certificado digital A1 (.pfx + senha) em Preferências → Certificado digital.
3. CSC/token NFC-e de produção (portal SEFAZ-SP) e trocar o ambiente de homologação para produção.
4. Contador: **primeiro, confirmar a IE** (isenta × número no CADESP); depois NFC-e × NF-e, natureza de operação + CFOP (5101 produção própria × 5102 revenda), CSOSN do Simples, NCM de cada prato.
5. Depois disso: emissão automática da NF no canal (ícone "Nota Fiscal" da exportação de vendas).

## Gotchas
- Mudar a situação de um pedido para "Cancelado" no Bling **exporta o cancelamento para a Shopify e notifica o cliente** — nunca mapear status não pago para "Cancelado".
- O campo Cidade só valida com o município escolhido pela busca do CEP (lupa); digitar o nome dá "Um município válido deve ser informado".
- Pedidos #1–#10 do Bling (25/09) incluem testes "QA VR Teste" já cancelados na Shopify — não faturar.
