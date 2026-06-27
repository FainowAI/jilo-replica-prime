/**
 * PostHog — instrumentação de produto (EAP Visibilidade de Dados, Sprint B).
 *
 * Política de ativação (D5 — analytics SÓ em produção):
 *   `analyticsEnabled` é true apenas com Project API Key presente, build de
 *   produção (`import.meta.env.PROD`) E no domínio real (jilomarmitas.com).
 *   Em dev / preview / sem key, TODOS os helpers viram no-op — nada é enviado.
 *
 * LGPD / PII:
 *   - `identify` usa apenas `user.id` (UUID) — NUNCA email/CPF como person property.
 *   - `before_send` mascara `:id` em URLs (rota /conta/pedidos/:id e qualquer UUID)
 *     antes de qualquer evento sair do browser (D5 / B.2.3).
 *   - Os eventos de negócio (ver events.ts) não carregam PII.
 *
 * A Project API Key do PostHog é pública por design (client-side), mas mesmo
 * assim vem via env var (VITE_PUBLIC_POSTHOG_KEY), nunca hardcoded.
 */
import posthog, { type CaptureResult } from "posthog-js";
import { SITE_HOSTNAME } from "@/config/site";

const KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
const HOST =
  (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) ||
  "https://us.i.posthog.com";

/** Só considera produção o domínio canônico (ou subdomínios) — exclui localhost e previews. */
function isProdHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === SITE_HOSTNAME || h.endsWith(`.${SITE_HOSTNAME}`);
}

/** Gate prod-only (D5). Único ponto de decisão de ativação. */
export const analyticsEnabled: boolean =
  !!KEY && import.meta.env.PROD && isProdHost();

// ─── Masking de PII em URL (D5 / B.2.3) ──────────────────────────────────────
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function maskUrl(url: unknown): unknown {
  if (typeof url !== "string") return url;
  return url
    .replace(/\/conta\/pedidos\/[^/?#]+/gi, "/conta/pedidos/:id")
    .replace(UUID_RE, ":id");
}

let initialized = false;

/** Inicializa o PostHog UMA vez, apenas quando habilitado. Chamado no main.tsx. */
export function initAnalytics(): void {
  if (initialized || !analyticsEnabled || !KEY) return;
  initialized = true;
  posthog.init(KEY, {
    api_host: HOST,
    defaults: "2025-05-24", // captura automática de $pageview em SPA (history change) + autocapture
    person_profiles: "always", // D4 — perfil para todo visitante
    before_send: (event: CaptureResult | null): CaptureResult | null => {
      if (event?.properties) {
        const p = event.properties as Record<string, unknown>;
        if (p.$current_url) p.$current_url = maskUrl(p.$current_url);
        if (p.$pathname) p.$pathname = maskUrl(p.$pathname);
        if (p.$referrer) p.$referrer = maskUrl(p.$referrer);
      }
      return event;
    },
  });
}

export { posthog };

// ─── Helpers seguros (no-op quando desabilitado) ─────────────────────────────
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!analyticsEnabled) return;
  posthog.capture(event, properties);
}

export function identifyUser(userId: string | null | undefined): void {
  if (!analyticsEnabled || !userId) return;
  posthog.identify(userId); // distinct_id = user.id (UUID). Sem email/CPF.
}

export function resetAnalytics(): void {
  if (!analyticsEnabled) return;
  posthog.reset();
}
