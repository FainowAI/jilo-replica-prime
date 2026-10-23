# Pagamento VR — estado em 2026-10-22

O cliente escolhe VR no carrinho somente quando `VITE_VR_ENABLED=true` (hoje `false`). Desde 21/10 (PR #24) o cartão é **tokenizado no servidor**: o dialog envia `card {nome, numero_cartao, data_expiracao AAMM, cvv}` + `cpf` ao `vr-checkout`. Ele valida JWT, limites, Luhn e validade, endereço, carrinho e PIX5, cria o draft e confere o total. Depois faz `POST /cartoes`, paga com `cartao_token_id` e apaga o token num `finally`. Nada de cartão ou token vai para log, banco ou analytics. A via RSA (`vr-public-key`, `keyId`/`cardEncrypted`) saiu do checkout e só resta no runner de homologação.

Decisão do dono (21/10): o número do cartão pode passar pela edge em trânsito (TLS), seguindo a recomendação da VR de 15/10 (Felipe de Pierro: usar token e dispensar a cifragem, que nenhum parceiro usa). Consequência: escopo PCI maior. Limites anti-teste-de-cartão:
- 5 recusas por usuário a cada 15 min;
- 8 tentativas por usuário, contadas depois do insert;
- breaker global de 30 recusas em 10 min, incluindo as recusas de tokenização.

Em 16/10, probes em HML confirmaram tokenização, pagamento e estorno total com o cartão de teste. Ficaram dúvidas sobre o que a consulta devolve depois da reserva (CONFIRMED/CANCELED) e do estorno parcial de 40% (CANCELADA com o valor parcial); foram perguntadas à VR no rascunho de 21/10. A App de produção foi aprovada no portal em 15/10. Para ligar faltam:
- os secrets de produção;
- o `VR_ID_FILIACAO` de produção (148822 é só HML);
- o espelhamento dos Extra fields;
- a VR aceitar as evidências.

Teste ponta a ponta contra a HML real: `_hml/vr-checkout-hml-live.ts` (cria 1 pedido `vr-test`, estorna e cancela com restock). Em 22/10 às 00h15 a HML da VR respondia 503 em tudo; rodar de novo.

Guardas locais do runner: recusa ambiente diferente de `hml`; não registra PAN, CVV, documento, nome, token ou texto livre da resposta nas evidências; valida os identificadores persistidos; interrompe a suíte quando qualquer passo falha e grava a evidência para reconciliação. Se o pagamento tokenizado ficar incerto, não exclui o token automaticamente antes de verificar a transação e fazer limpeza controlada. Testes com stubs não substituem HML. Não executar cobranças reais.

Ao criar draft orders para VR ou Cielo, `profiles.shopify_customer_id` é tratado como dado não confiável: antes de preencher `purchasingEntity`, o backend consulta a Shopify pelo GID canônico e compara o e-mail retornado ao e-mail autenticado usado no pedido. Se o GID for inválido ou apontar para outro e-mail, o draft segue apenas com o e-mail do comprador. Erro na consulta impede a criação do draft antes da cobrança. Isso protege o vínculo do pedido, mas não substitui a correção de permissão da coluna no Supabase nem a revisão independente de `customer-orders`.

Fontes no repositório: `.claude/docs/eap_pagamento_vr.md`, `.claude/.work/pagamento-vr/tickets/06-homologacao.md`, `supabase/functions/_shared/vr-client.ts`, `supabase/functions/_hml/vr-homologacao.ts`, `supabase/functions/vr-checkout/handler.ts`.

## Verificação real HML em 2026-10-16

Com a massa de cartão de teste fornecida pela VR e `VR_ENV=hml`, o OAuth e a chave pública passaram. `POST /cartoes` devolveu HTTP 201 e `cartao_token_id`; `GET /cartoes/{id}` confirmou o mesmo token e `DELETE` respondeu 200. Esse token de cartão é distinto do `access_token` OAuth. Um pagamento com `cartao_token_id` respondeu 201/código `00`; consulta confirmou `CONFIRMADA`, e estorno total seguido de consulta confirmou `CANCELADA`. Nenhuma cobrança de produção ocorreu. Evidência sanitizada está no diretório local ignorado `.claude/.work/pagamento-vr`.

Uma reserva HML foi criada (201/código `00`); a consulta retornou `CONFIRMED`, não `PENDENTE`. O cancelamento por PATCH respondeu 200/código `00` e a consulta final retornou `CANCELED`, não `CANCELADA`. Um estorno solicitado de 40% respondeu 200/código `00` com o valor parcial, mas a consulta da transação retornou `CANCELADA` com esse valor, em vez de `CONFIRMADA` com o total original. Os probes isolados pararam ao encontrar essas divergências; o runner financeiro por CLI não foi executado. Não concluir que o reembolso parcial preservou o saldo, nem executar a efetivação da reserva até confirmar a semântica desses status com a VR. O checkout do site ainda usa RSA e permanece não homologado.
