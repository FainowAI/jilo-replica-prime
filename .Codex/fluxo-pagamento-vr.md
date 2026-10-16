# Pagamento VR — estado verificado em 2026-10-16

O cliente escolhe VR no carrinho somente quando `VITE_VR_ENABLED=true`. O checkout atual cifra o cartão no navegador com a chave pública obtida por `vr-public-key`; `vr-checkout` exige `keyId` e `cardEncrypted`, cria um draft na Shopify, confere o total do carrinho, chama a API Captura e completa o pedido após aprovação. A integração não está validada para produção e a flag rastreada permanece desligada.

O cliente compartilhado aceita também `cartaoTokenId` em pagamento e reserva, mas o checkout do site não usa essa via. O runner `_hml/vr-homologacao.ts` cobre as funcionalidades exigidas pela VR em testes com fetch simulado; a CLI financeira permanece bloqueada. O preflight de OAuth e chave pública em HML passou em 14/10, sem transação. Nenhum dos cenários financeiros HML foi comprovado.

Felipe de Pierro recomendou em 15/10 cartão tokenizado e dispensou `cartao_dados_criptografados` nesse fluxo. As notas locais do Swagger Captura 2.4.0 indicam que o primeiro `POST /cartoes` recebe dados do cartão em JSON. Antes de executar esse passo, confirmar o contrato vigente e o tratamento permitido dos dados com a VR; confirmar também a aceitação do token como evidência das cinco funcionalidades. A aprovação cadastral de uma App de produção não comprova pagamentos.

Guardas locais do runner: recusa ambiente diferente de `hml`; não registra PAN, CVV, documento, nome, token ou texto livre da resposta nas evidências; valida os identificadores persistidos; interrompe a suíte quando qualquer passo falha e grava a evidência para reconciliação. Se o pagamento tokenizado ficar incerto, não exclui o token automaticamente antes de verificar a transação e fazer limpeza controlada. Testes com stubs não substituem HML. Não executar cobranças reais.

Fontes no repositório: `.claude/docs/eap_pagamento_vr.md`, `.claude/.work/pagamento-vr/tickets/06-homologacao.md`, `supabase/functions/_shared/vr-client.ts`, `supabase/functions/_hml/vr-homologacao.ts`, `supabase/functions/vr-checkout/handler.ts`.
