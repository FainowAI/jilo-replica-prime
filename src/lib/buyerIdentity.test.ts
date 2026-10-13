import { describe, it, expect } from "vitest";
import { buildBuyerIdentity } from "./shopify";

describe("buildBuyerIdentity", () => {
  it("apara e omite campos vazios", () => {
    expect(buildBuyerIdentity({ email: " a@b.com ", phone: "" })).toEqual({ email: "a@b.com", countryCode: "BR" });
  });
  it("sem dados só leva countryCode", () => {
    expect(buildBuyerIdentity({})).toEqual({ countryCode: "BR" });
  });
  it("telefone vira E.164", () => {
    expect(buildBuyerIdentity({ phone: "(12) 99999-8888" }).phone).toBe("+5512999998888");
  });
});
