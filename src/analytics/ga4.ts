/**
 * GA4 — aquisição & canais (EAP Visibilidade de Dados, Sprint C).
 *
 * Papel (D6): GA4 = AQUISIÇÃO (pageview, canais), enquanto o PostHog = produto.
 * gtag DIRETO, sem GTM (D6). Sem dependência nova — o gtag entra como <script>.
 *
 * Reuso da Sprint B (não duplica o gate nem o masking — ver fluxo-analytics.md):
 *   - `analyticsEnabled` (gate prod-only D5/R70) de posthog.ts.
 *   - `maskUrl` (masking de PII em URL) de posthog.ts.
 * Sem Measurement ID, `ga4Enabled = false` e todos os helpers viram no-op —
 * exatamente como o PostHog fica inerte sem a key.
 *
 * Nome de evento: o GA4 só aceita [A-Za-z0-9_] começando por letra. O dicionário
 * (events.ts) usa nomes PT-BR com espaço/acento ("produto visualizado"); por isso
 * sanitizamos SÓ no envio ao GA4 ("produto visualizado" -> "produto_visualizado").
 * O PostHog mantém o nome original — "mesmos eventos" nos dois sistemas (D6).
 */
import { analyticsEnabled, maskUrl } from "./posthog";

const MEASUREMENT_ID = import.meta.env.VITE_PUBLIC_GA4_MEASUREMENT_ID as
  | string
  | undefined;

/** Gate do GA4: o gate prod-only da Sprint B + presença do Measurement ID. */
export const ga4Enabled: boolean = analyticsEnabled && !!MEASUREMENT_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/** Empilha no dataLayer no formato que o gtag.js consome (queue antes/depois do load). */
function gtag(...args: unknown[]): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

/** GA4: nome de evento só com [a-z0-9_], começando por letra (sem acento/espaço). */
function sanitizeEventName(event: string): string {
  const normalized = event
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (concluído -> concluido)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_") // espaço/símbolo -> _
    .replace(/^_+|_+$/g, ""); // trim de _ nas pontas
  return /^[a-z]/.test(normalized) ? normalized : `evt_${normalized}`;
}

let initialized = false;

/** Carrega o gtag e configura prod-only com send_page_view:false (C.1.2). Chamado no main.tsx. */
export function initGA4(): void {
  if (initialized || !ga4Enabled || !MEASUREMENT_ID) return;
  initialized = true;

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(s);

  gtag("js", new Date());
  // send_page_view:false — o pageview por rota vem do RouteChangeTracker (C.1.3),
  // senão o GA4 só contaria o primeiro load da SPA.
  gtag("config", MEASUREMENT_ID, { send_page_view: false });
}

/** Pageview por rota (C.1.3). URL mascarada (mesmo helper da Sprint B, D5/C.2.2). */
export function pageviewGA4(path: string): void {
  if (!ga4Enabled) return;
  gtag("event", "page_view", {
    page_path: maskUrl(path) as string,
    page_location: maskUrl(window.location.href) as string,
    page_title: document.title,
  });
}

/** Evento de negócio no GA4 (C.2.1). Mesmo dicionário do PostHog, nome sanitizado. */
export function trackGA4(event: string, properties?: Record<string, unknown>): void {
  if (!ga4Enabled) return;
  gtag("event", sanitizeEventName(event), properties ?? {});
}
