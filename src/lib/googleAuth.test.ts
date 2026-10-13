import { describe, it, expect } from "vitest";
import { isNewAccount } from "./googleAuth";

const agora = Date.parse("2026-10-13T12:00:00Z");
const ha = (ms: number) => new Date(agora - ms).toISOString();

describe("isNewAccount", () => {
  it("conta criada há 10 s é nova", () => {
    expect(isNewAccount({ created_at: ha(10_000) }, agora)).toBe(true);
  });
  it("conta criada há 2 h é login recorrente", () => {
    expect(isNewAccount({ created_at: ha(2 * 3600_000) }, agora)).toBe(false);
  });
  it("sem created_at (ou sem user) não é nova", () => {
    expect(isNewAccount({}, agora)).toBe(false);
    expect(isNewAccount(null, agora)).toBe(false);
  });
});
