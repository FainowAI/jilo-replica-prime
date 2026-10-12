import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ data: null }) }));
vi.mock("@/lib/alelo/client", async (orig) => ({ ...(await orig<object>()), getSopToken: vi.fn(), payWithAlelo: vi.fn() }));

import AleloCardDialog from "./AleloCardDialog";

describe("AleloCardDialog (H5)", () => {
  it("campos do cartão são DOM não controlado com classes SOP e ph-no-capture", () => {
    render(
      <MemoryRouter>
        <AleloCardDialog
          open
          onOpenChange={() => {}}
          checkout={{ cartId: "gid://shopify/Cart/x", selectedAddressId: "a", deliveryMethod: "uber_direct" }}
        />
      </MemoryRouter>,
    );
    const num = document.querySelector<HTMLInputElement>("input.bp-sop-cardnumber")!;
    const cvv = document.querySelector<HTMLInputElement>("input.bp-sop-cardcvvc")!;
    expect(document.querySelector("input.bp-sop-cardholdername")).toBeTruthy();
    expect(document.querySelector("input.bp-sop-cardexpirationdate")).toBeTruthy();
    expect(cvv.type).toBe("password");
    expect(document.querySelector(".ph-no-capture")).toBeTruthy();

    // Não controlado: o valor digitado vive só no DOM (um input controlado sem estado ignoraria a digitação
    // ou seria reescrito por máscara) e é preservado como digitado, sem formatação vinda de state.
    fireEvent.change(num, { target: { value: "4111 1111" } });
    expect(num.value).toBe("4111 1111");
  });
});
