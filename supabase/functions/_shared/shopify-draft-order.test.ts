import { assertEquals, assertRejects } from "jsr:@std/assert";
import { createDraftOrder, type DraftOrderInput } from "./shopify-draft-order.ts";

const input: DraftOrderInput = {
  email: "buyer@example.test",
  customerId: "gid://shopify/Customer/123",
  lines: [{ variantId: "gid://shopify/ProductVariant/1", quantity: 1 }],
  shippingAddress: { address1: "Test", city: "Test", provinceCode: "SP", zip: "00000000", countryCode: "BR" },
  tags: ["test"],
  customAttributes: {},
};

function fakeAdmin(customerEmail: string | null, failLookup = false) {
  let queriedCustomer = false;
  let purchasingEntity: unknown;
  const admin = async <T>(query: string, variables?: Record<string, unknown>): Promise<T> => {
    if (query.includes("DraftCustomerEmail")) {
      queriedCustomer = true;
      if (failLookup) throw new Error("shopify_admin_http_503");
      return { customer: { id: input.customerId, email: customerEmail } } as T;
    }
    purchasingEntity = (variables?.input as Record<string, unknown>).purchasingEntity;
    return {
      draftOrderCreate: { draftOrder: { id: "gid://shopify/DraftOrder/1", totalPriceSet: { shopMoney: { amount: "10.00" } } }, userErrors: [] },
    } as T;
  };
  return { admin, state: () => ({ queriedCustomer, purchasingEntity }) };
}

Deno.test("draft keeps the verified customer's ID", async () => {
  const stub = fakeAdmin("BUYER@example.test");
  await createDraftOrder(input, stub.admin);
  assertEquals(stub.state(), { queriedCustomer: true, purchasingEntity: { customerId: input.customerId } });
});

Deno.test("draft does not bind a foreign customer ID from the profile", async () => {
  const stub = fakeAdmin("other@example.test");
  await createDraftOrder(input, stub.admin);
  assertEquals(stub.state(), { queriedCustomer: true, purchasingEntity: undefined });
});

Deno.test("draft ignores malformed customer ID without looking it up", async () => {
  const stub = fakeAdmin("buyer@example.test");
  await createDraftOrder({ ...input, customerId: "123 OR other" }, stub.admin);
  assertEquals(stub.state(), { queriedCustomer: false, purchasingEntity: undefined });
});

Deno.test("draft fails before creation if ownership lookup fails", async () => {
  const stub = fakeAdmin(null, true);
  await assertRejects(() => createDraftOrder(input, stub.admin), Error, "shopify_admin_http_503");
  assertEquals(stub.state(), { queriedCustomer: true, purchasingEntity: undefined });
});
