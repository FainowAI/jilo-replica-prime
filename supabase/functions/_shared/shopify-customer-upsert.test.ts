import { assertEquals, assertRejects } from "jsr:@std/assert";
import { upsertShopifyCustomer, type CallAdmin } from "./shopify-customer-upsert.ts";

const input = {
  email: "a@b.com", firstName: "Ana", lastName: "Silva", phone: "+5512999999999",
  tags: ["jilo-customer", "source:supabase"], note: "n",
};
const ok = (data: object) => Promise.resolve(new Response(JSON.stringify({ data })));

/** Fake: 1ª chamada = busca; demais consomem `replies` em ordem. Grava as variáveis. */
function fake(found: object | null, replies: object[]) {
  const calls: { query: string; variables?: Record<string, any> }[] = [];
  const cb: CallAdmin = (p) => {
    calls.push(p as never);
    if (calls.length === 1) return ok({ customers: { edges: found ? [{ node: found }] : [] } });
    return ok(replies.shift()!);
  };
  return { cb, calls };
}

Deno.test("já existe -> linked com customerUpdate e tags unidas", async () => {
  const { cb, calls } = fake({ id: "gid://shopify/Customer/1", tags: ["vip"] }, [
    { customerUpdate: { customer: { id: "gid://shopify/Customer/1" }, userErrors: [] } },
  ]);
  const r = await upsertShopifyCustomer(cb, input);
  assertEquals(r, { customerId: "gid://shopify/Customer/1", action: "linked" });
  assertEquals(calls[0].variables, { q: "email:a@b.com" });
  assertEquals(calls[1].query.includes("customerUpdate"), true);
  assertEquals(calls[1].variables!.input.tags, ["vip", "jilo-customer", "source:supabase"]);
  assertEquals("note" in calls[1].variables!.input, false);
});

Deno.test("não existe -> created com customerCreate sem identifier", async () => {
  const { cb, calls } = fake(null, [
    { customerCreate: { customer: { id: "gid://shopify/Customer/2" }, userErrors: [] } },
  ]);
  const r = await upsertShopifyCustomer(cb, input);
  assertEquals(r, { customerId: "gid://shopify/Customer/2", action: "created" });
  assertEquals(calls[1].query.includes("identifier"), false);
  assertEquals(calls[1].variables!.input.email, "a@b.com");
});

Deno.test("userError de phone -> retry sem phone", async () => {
  const { cb, calls } = fake(null, [
    { customerCreate: { customer: null, userErrors: [{ field: ["input", "phone"], message: "Phone is invalid" }] } },
    { customerCreate: { customer: { id: "gid://shopify/Customer/3" }, userErrors: [] } },
  ]);
  const r = await upsertShopifyCustomer(cb, input);
  assertEquals(r.customerId, "gid://shopify/Customer/3");
  assertEquals(calls.length, 3);
  assertEquals(calls[1].variables!.input.phone, "+5512999999999");
  assertEquals("phone" in calls[2].variables!.input, false);
});

Deno.test("userError que não é phone -> lança sem PII", async () => {
  const { cb } = fake(null, [
    { customerCreate: { customer: null, userErrors: [{ field: ["input", "email"], message: "a@b.com taken" }] } },
  ]);
  const e = await assertRejects(() => upsertShopifyCustomer(cb, input));
  assertEquals((e as Error).message.includes("a@b.com"), false);
});

Deno.test("e-mail com espaço -> lança antes de chamar a Shopify", async () => {
  const { cb, calls } = fake(null, []);
  await assertRejects(() => upsertShopifyCustomer(cb, { ...input, email: "a b@c.com" }), Error, "invalid_email");
  assertEquals(calls.length, 0);
});
