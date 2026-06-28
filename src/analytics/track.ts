/**
 * Dispatcher unificado de eventos de negócio (EAP Visibilidade de Dados).
 *
 * Fonte única do funil: o dicionário `analytics.*` (events.ts) chama este `track`,
 * que faz fan-out para os DOIS sistemas — PostHog (produto) e GA4 (aquisição), D6.
 * Cada sink tem o próprio gate/no-op (prod-only) e o próprio masking; este módulo
 * só reparte a chamada, sem decidir ativação.
 */
import { track as trackPosthog } from "./posthog";
import { trackGA4 } from "./ga4";

export function track(event: string, properties?: Record<string, unknown>): void {
  trackPosthog(event, properties);
  trackGA4(event, properties);
}
