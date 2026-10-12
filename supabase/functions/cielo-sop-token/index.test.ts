import { assertEquals } from "jsr:@std/assert";
import { handleSopToken, memoryRateLimit, type SopTokenDeps } from "./handler.ts";

const CART = { id: "gid://shopify/Cart/1", lines: [{ id: "l" }] } as never;

function req(body: unknown = { cartId: "gid://shopify/Cart/1" }, auth: string | null = "Bearer t"): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  return new Request("http://localhost/cielo-sop-token", { method: "POST", headers, body: JSON.stringify(body) });
}

function deps(o: Partial<SopTokenDeps> = {}): SopTokenDeps {
  return {
    getUser: async () => ({ id: "u1", email: "qa@x.com" }),
    getCart: async () => CART,
    getSopAccessToken: async () => ({ accessToken: "tok-123", expiresIn: 3600 }),
    allowRate: () => true,
    cieloEnv: () => "sandbox",
    env: { ALELO_ENABLED: "true", ALELO_QA_EMAILS: "qa@x.com" },
    now: () => new Date(),
    ...o,
  };
}

Deno.test("kill-switch desligado => 404", async () => {
  const r = await handleSopToken(req(), deps({ env: { ALELO_ENABLED: null, ALELO_QA_EMAILS: null } }));
  assertEquals(r.status, 404);
});

Deno.test("sem sessão => 401", async () => {
  assertEquals((await handleSopToken(req(undefined, null), deps({ getUser: async () => null }))).status, 401);
});

Deno.test("fora de prod, e-mail fora da allowlist => 403", async () => {
  assertEquals((await handleSopToken(req(), deps({ getUser: async () => ({ id: "u", email: "x@y.com" }) }))).status, 403);
});

Deno.test("body extra => 400; cart vazio/inexistente => 422", async () => {
  assertEquals((await handleSopToken(req({ cartId: "gid://shopify/Cart/1", x: 1 }), deps())).status, 400);
  assertEquals((await handleSopToken(req(), deps({ getCart: async () => null }))).status, 422);
  assertEquals((await handleSopToken(req(), deps({ getCart: async () => ({ lines: [] } as never) }))).status, 422);
});

Deno.test("rate limit => 429", async () => {
  assertEquals((await handleSopToken(req(), deps({ allowRate: () => false }))).status, 429);
  const t = Date.now();
  let ok = 0;
  for (let i = 0; i < 12; i++) if (memoryRateLimit("rl-user", t)) ok++;
  assertEquals(ok, 10);
});

Deno.test("sucesso: só accessToken/environment, no-store", async () => {
  const r = await handleSopToken(req(), deps());
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("Cache-Control"), "no-store");
  const j = await r.json();
  assertEquals(Object.keys(j).sort(), ["accessToken", "environment"]);
  assertEquals(j.accessToken, "tok-123");
  assertEquals(j.environment, "sandbox");
});

Deno.test("falha do OAuth => 502 sem vazar detalhe", async () => {
  const r = await handleSopToken(req(), deps({ getSopAccessToken: async () => { throw new Error("secret-detail"); } }));
  assertEquals(r.status, 502);
  assertEquals((await r.text()).includes("secret-detail"), false);
});
