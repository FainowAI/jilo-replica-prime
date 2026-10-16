# Perfil e pedidos do cliente

O perfil e os endereços ficam no Supabase. A área `/conta/pedidos` chama a Edge Function `customer-orders`, que consulta pedidos na Shopify Admin API a partir da identidade obtida do JWT, sem aceitar um ID de cliente no corpo da requisição.

## Vínculo Shopify verificado em 2026-10-16

`profiles.shopify_customer_id` é um dado gravável pelo usuário e não pode ser usado sozinho como prova de propriedade. A Edge Function só busca pedidos com `customer_id` depois de consultar o mesmo GID na Shopify e confirmar que o e-mail retornado corresponde ao e-mail autenticado. GID inválido, cliente ausente, e-mail diferente ou falha nessa consulta levam à busca pelo e-mail do JWT, validado contra caracteres da DSL de pesquisa. A criação de drafts de VR e Cielo aplica a mesma verificação antes de incluir `purchasingEntity`.

Essa guarda de leitura e checkout não revoga a permissão de escrita da coluna. A correção de permissões do Supabase e a revisão dos vínculos já existentes seguem pendentes. Testes desta mudança usam somente identidades sintéticas.

Detalhes de componentes e tabelas: `.claude/fluxo-perfil-usuario.md`.
