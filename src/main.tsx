import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { PostHogProvider } from "@posthog/react";
import App from "./App.tsx";
import "./index.css";
import { initAnalytics, posthog } from "@/analytics/posthog";
import { initGA4 } from "@/analytics/ga4";

// PostHog (EAP Sprint B): inicializa só em produção (gate em posthog.ts);
// fora disso o client fica inerte e os helpers viram no-op.
initAnalytics();
// GA4 (EAP Sprint C): mesmo gate prod-only + Measurement ID; inerte sem o env var.
initGA4();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <PostHogProvider client={posthog}>
      <App />
    </PostHogProvider>
  </HelmetProvider>
);
