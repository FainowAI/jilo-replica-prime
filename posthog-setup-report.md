# PostHog post-wizard report

The wizard has completed a deep integration of your project. PostHog was already partially instrumented (7 events from Sprint B of EAP Visibilidade de Dados). This run supplemented that foundation by:

- Adding 3 new business-value events to `src/analytics/events.ts` (`kit temático adicionado`, `kit livre adicionado`, `cupom aplicado`) and relaxing the `deliverable` property to optional in `enderecoCadastrado`.
- Wiring the missing call site for `endereço cadastrado` in `AddressFormDialog.tsx` (event was defined but never fired).
- Adding `kit temático adicionado` to `Kit.tsx` so the themed-kit conversion is tracked.
- Adding `kit livre adicionado` to `KitLivre.tsx` so the custom-kit conversion is tracked.
- Adding `cupom aplicado` to `Carrinho.tsx` so coupon effectiveness is measurable.
- Populating `.env` with `VITE_PUBLIC_POSTHOG_KEY` and `VITE_PUBLIC_POSTHOG_HOST` (project token already existed via env var reference in `posthog.ts`).

The existing setup (PostHogProvider in `main.tsx`, prod-only gate, PII masking via `before_send`, user identify/reset in `AuthContext.tsx`) was untouched.

## Events

| Event name | Description | File |
|---|---|---|
| `produto visualizado` | Product detail page opened | `src/pages/Product.tsx` |
| `item adicionado` | Individual product added to cart (excl. shipping variant) | `src/stores/cartStore.ts` |
| `carrinho aberto` | Cart page loaded | `src/pages/Carrinho.tsx` |
| `kit montado` | Cart quantity hits a multiple of 7 | `src/stores/cartStore.ts` |
| `checkout iniciado` | User clicks "Ir para o Checkout" or "Buy Now" | `src/pages/Product.tsx`, `src/pages/Carrinho.tsx` |
| `cadastro concluído` | Signup completed successfully | `src/contexts/AuthContext.tsx` |
| `login efetuado` | Login completed successfully | `src/contexts/AuthContext.tsx` |
| `endereço cadastrado` | New delivery address saved to account | `src/components/conta/AddressFormDialog.tsx` |
| `kit temático adicionado` | Themed kit (Leveza/Força/Sabor/Verde) added to cart | `src/pages/Kit.tsx` |
| `kit livre adicionado` | Custom-assembled Kit Livre confirmed and added to cart | `src/pages/KitLivre.tsx` |
| `cupom aplicado` | Valid discount coupon applied in cart | `src/pages/Carrinho.tsx` |

## Next steps

We've built a dashboard and five insights to track user behavior:

- **Dashboard**: [Analytics basics (wizard)](https://us.posthog.com/project/487943/dashboard/1767298)
- **Funil de Compra** — purchase conversion funnel: [https://us.posthog.com/project/487943/insights/0Hyycq5a](https://us.posthog.com/project/487943/insights/0Hyycq5a)
- **Intenção de Compra Semanal** — weekly cart opens & checkout starts: [https://us.posthog.com/project/487943/insights/Q3LYLuTo](https://us.posthog.com/project/487943/insights/Q3LYLuTo)
- **Adoção de Kits** — weekly kit adds (themed + custom + milestone): [https://us.posthog.com/project/487943/insights/04FGri4l](https://us.posthog.com/project/487943/insights/04FGri4l)
- **Aquisição de Usuários** — weekly signups and logins: [https://us.posthog.com/project/487943/insights/NsbxGcyt](https://us.posthog.com/project/487943/insights/NsbxGcyt)
- **Itens Adicionados ao Carrinho** — daily add-to-cart trend: [https://us.posthog.com/project/487943/insights/DMg3ShH8](https://us.posthog.com/project/487943/insights/DMg3ShH8)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `VITE_PUBLIC_POSTHOG_KEY` and `VITE_PUBLIC_POSTHOG_HOST` to `.env.example` (and any CI/bootstrap scripts) so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — the current handler identifies on `SIGNED_IN` and on session restore, which covers returning sessions; verify this works end-to-end in production.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
