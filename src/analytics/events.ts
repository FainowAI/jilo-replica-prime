/**
 * Dicionário de eventos-chave do funil (EAP Visibilidade de Dados, Seção 5).
 *
 * Nomes em PT-BR `[objeto] [verbo]`, compartilhados com o GA4 (Sprint C).
 * NENHUMA propriedade carrega PII (sem email, CPF, nome, telefone, endereço cru).
 * Todos os wrappers são no-op fora de produção (ver `track` em posthog.ts).
 *
 * Pageview e cliques são capturados automaticamente (autocapture + defaults SPA);
 * esta lista é só dos eventos de NEGÓCIO que merecem nome próprio para o funil.
 */
import { track } from "./track";

export type MetodoLogin = "senha" | "google";

export const analytics = {
  /** Abre a página de produto. */
  produtoVisualizado: (p: { handle: string; grupo?: string | null; preco?: number | null }) =>
    track("produto visualizado", p),

  /** Add ao carrinho (variant fantasma de frete é excluída no call site). */
  itemAdicionado: (p: { handle: string; grupo?: string | null; qtd: number }) =>
    track("item adicionado", p),

  /** Abre o CartDrawer ou a página /carrinho. */
  carrinhoAberto: (p: { itens: number; subtotal: number }) =>
    track("carrinho aberto", p),

  /** Quantidade de marmitas (sem frete) atinge um múltiplo de 7. */
  kitMontado: (p: { tamanho: number }) => track("kit montado", p),

  /** Clica em "Ir para o Checkout" (ou Buy Now). */
  checkoutIniciado: (p: {
    itens: number;
    frete: "gratis" | "pago";
    metodoEntrega?: string | null;
    metodoPagamento?: string | null;
  }) => track("checkout iniciado", p),

  /** Signup concluído com sucesso. Só o método (sem PII). */
  cadastroConcluido: (p?: { metodo?: MetodoLogin }) => track("cadastro concluído", p),

  /** Login efetuado com sucesso. Só o método (sem PII). */
  loginEfetuado: (p?: { metodo?: MetodoLogin }) => track("login efetuado", p),

  /** Falha de login/cadastro, com o motivo normalizado (nunca o e-mail nem a mensagem crua). */
  loginFalhou: (p: { metodo: MetodoLogin; motivo: "credenciais" | "nao_confirmado" | "limite" | "outro" }) =>
    track("login falhou", p),

  /** Cria um endereço. UF/cidade não são PII identificável isolada; sem rua/CEP. */
  enderecoCadastrado: (p: { uf: string; cidade: string; deliverable?: boolean }) =>
    track("endereço cadastrado", p),

  /** Adiciona um kit temático (Leveza, Força, Sabor, Verde) ao carrinho. */
  kitTematicoAdicionado: (p: { slug: string; nome: string; tamanho: number; desconto: number }) =>
    track("kit temático adicionado", p),

  /** Confirma e adiciona um Kit Livre (montagem manual) ao carrinho. */
  kitLivreAdicionado: (p: { tamanho: number; desconto: number }) =>
    track("kit livre adicionado", p),

  /** Cupom de desconto aplicado com sucesso no carrinho. */
  cupomAplicado: (p: { codigo: string }) =>
    track("cupom aplicado", p),
};
