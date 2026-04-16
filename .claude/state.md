# Estado do Projeto

## Última atualização
2026-04-16

## O que foi feito na última sessão
- Ajustes de dados institucionais no Footer (CNPJ 39.659.013/0001-02, WhatsApp +55 12 98895-0426, ano 2026, nomes oficiais dos kits, remoção do e-mail)
- FAQ: WhatsApp corrigido, resposta de prazo de entrega atualizada (18h-23h, 48h após confirmação), nova pergunta sobre frete grátis
- Hero: chip "Frete grátis" adicionado à primeira dobra
- BenefitsBar: "4,7 de 5" substituído por "Frete Grátis"
- Novo componente `PaymentMethodSelector` no carrinho — aplica cupom PIX5 automaticamente ao selecionar PIX
- Removido `PixCallout` da página `/carrinho` (continua em Product/CartDrawer/Kit/KitLivre)

## Arquivos afetados
- Editados: Footer.tsx, FAQ.tsx, BenefitsBar.tsx, Hero.tsx, Carrinho.tsx
- Criados: PaymentMethodSelector.tsx
- Docs atualizados: fluxo-carrinho-checkout.md, fluxo-infraestrutura.md, state.md (novo)

## Pendências
- Validar que o cupom `PIX5` existe no Shopify Admin e está ativo (verificar painel Shopify)
- Testar fluxo de substituição de cupom: aplicar BEMVINDO10 → clicar PIX → confirmar substituição
- QA mobile do PaymentMethodSelector em 375px

## Notas para a próxima sessão
- A próxima etapa planejada é a integração Getnet custom checkout (substitui o redirect Shopify). Quando essa integração ocorrer, o `PaymentMethodSelector` passa a controlar de verdade o método de pagamento, e a lógica de cupom PIX5 será replicada/migrada para o fluxo Getnet.
- A whitelist de CEP em `cepValidator.ts` continua estática — avaliar migrar para Supabase ou metafields do Shopify quando a operação expandir geograficamente.
