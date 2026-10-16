import { assertEquals } from "jsr:@std/assert";
import { verifiedCustomerNumericId } from "./ownership.ts";

const gid = "gid://shopify/Customer/123";

Deno.test("accepts a customer ID only when Shopify confirms the JWT email", async () => {
  const result = await verifiedCustomerNumericId(gid, "buyer@example.test", async () => ({
    id: gid,
    email: "BUYER@example.test",
  }));
  assertEquals(result, "123");
});

Deno.test("rejects a foreign customer ID despite its valid GID shape", async () => {
  const result = await verifiedCustomerNumericId(gid, "buyer@example.test", async () => ({
    id: gid,
    email: "other@example.test",
  }));
  assertEquals(result, null);
});

Deno.test("rejects malformed GID without a Shopify lookup", async () => {
  let called = false;
  const result = await verifiedCustomerNumericId("123 OR created_at:>2020-01-01", "buyer@example.test", async () => {
    called = true;
    return { id: gid, email: "buyer@example.test" };
  });
  assertEquals(result, null);
  assertEquals(called, false);
});

Deno.test("falls back to email search when Shopify lookup fails", async () => {
  const result = await verifiedCustomerNumericId(gid, "buyer@example.test", async () => {
    throw new Error("temporary error");
  });
  assertEquals(result, null);
});
