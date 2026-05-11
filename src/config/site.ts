/**
 * Configurações de identidade e URLs do site Jilo.
 *
 * Regra de negócio (R30): URL canônica vem de SITE_URL com fallback
 * https://jilomarmitas.com. Mantém uma única fonte de verdade pro frontend
 * de quaisquer links absolutos (return URLs, og:image override, etc).
 *
 * O gerador SEO em build time (scripts/) já usa a env var SITE_URL —
 * este arquivo é o equivalente em runtime no browser.
 */
export const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined) ||
  "https://jilomarmitas.com";

/**
 * Domínio canônico sem protocolo (útil pra comparações de hostname).
 */
export const SITE_HOSTNAME = "jilomarmitas.com";
