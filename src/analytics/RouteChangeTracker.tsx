/**
 * RouteChangeTracker — pageview por rota no GA4 (EAP Sprint C, C.1.3).
 *
 * O gtag é configurado com send_page_view:false (ver ga4.ts), então cada
 * navegação client-side do React Router precisa emitir o `page_view` manualmente.
 * O PostHog NÃO precisa disso — ele captura $pageview sozinho via SPA defaults.
 * Inerte fora de produção (pageviewGA4 é no-op quando ga4Enabled = false).
 *
 * Deve ser montado DENTRO do <BrowserRouter> (usa useLocation).
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { pageviewGA4 } from "./ga4";

export function RouteChangeTracker(): null {
  const location = useLocation();

  useEffect(() => {
    pageviewGA4(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return null;
}
