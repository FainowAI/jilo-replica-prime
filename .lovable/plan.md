

# Plano de Implementação — Réplica do Site Jilo

## Visão Geral
Reprodução fiel do site da Jilo como uma página institucional/e-commerce premium em React + Tailwind, com todas as 15 seções descritas, visual editorial sofisticado, e integração Shopify preparada para quando os produtos forem adicionados.

## Design System
- **Paleta**: Verde escuro (#1E3A1E), verde secundário (#2D5016), creme (#FAF7F2), dourado (#D4A017), branco, texto escuro (#1A1A1A), cinza (#6B6B6B)
- **Tipografia**: DM Serif Display para títulos serifados, DM Sans para corpo/interface
- **Estilo**: Editorial premium, bordas suaves, sombras leves, cantos arredondados

## Estrutura das Seções (ordem exata do design)

### 1. Barra de Anúncio Superior
Barra fina verde escuro com texto promocional sobre VA/VR, entrega 48h e 5% OFF no PIX.

### 2. Header / Navegação
Header branco com logo Jilo, menu central (Cardápio, Sobre, Assinatura, Fale Conosco), ícones à direita e botão "Montar meu Kit".

### 3. Hero Principal
Seção grande com fundo gastronômico placeholder, overlay degradê verde escuro, eyebrow, título serifado "Sua semana resolvida. Sem improviso, sem culpa.", subtexto, dois botões e badges.

### 4. Barra de Benefícios (4 colunas)
Avaliação 4,7/5, 5% OFF PIX, Entrega 48h, Feito artesanalmente — com ícones circulares.

### 5. Bloco Institucional "Nossa Filosofia"
Imagem de fundo com caixa dourada contendo título serifado, texto e link "Montar meu Kit".

### 6. Categorias Rápidas
Chips arredondados: Aves & Suínos, Bovinos, Peixes & Massas, Veganos.

### 7. "Os Favoritos da Galera"
4 cards de prato com imagem placeholder, nome, preço, badge e botão circular de adicionar.

### 8. "Kits para a Semana"
4 cards grandes de kits com fundo escuro, informações de pratos/preço e badges. Botão "Ver todos os kits".

### 9. Seção VA/VR
Bloco verde escuro com badges de bandeiras (Alelo, Sodexo, VR, Ticket, Flash), texto de apoio e imagem lifestyle placeholder.

### 10. "Todos os Pratos"
Vitrine completa com filtros, subcategorias (Aves & Suínos, Bovinos, Peixes & Massas, Veganos), cada uma com múltiplos cards de pratos com nome, preço, badges. Visual 100% fiel ao design.

### 11. "Como Funciona"
3 etapas conectadas: Escolha → Receba → Aqueça, com círculos amarelos e ícones.

### 12. Depoimentos
3 cards com avatar, estrelas e texto dos depoimentos de Mariana, Carlos e Fernanda.

### 13. "Nossa História"
Bloco com eyebrow, título, textos sobre a marca, métricas (+2.400 clientes, 24 pratos, 0 conservantes) e botão "Conheça nossa história".

### 14. FAQ
Acordeão estilizado com 6 perguntas, primeira aberta. Botão "Falar no WhatsApp" ao final.

### 15. Footer
4 colunas (Logo/redes, Cardápio, Kits, Atendimento) com fundo verde escuro e barra inferior com copyright e CNPJ.

## Integração Shopify
- Storefront API configurada e pronta para consumir produtos reais
- Cart system com Zustand para quando os produtos forem criados
- Nenhum produto será criado agora (conforme solicitado), mas a infraestrutura estará pronta

## Responsividade
Desktop-first com adaptação responsiva para tablet e mobile em todas as seções.

