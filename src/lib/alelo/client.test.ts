import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { payWithAlelo, getSopToken, AleloCheckoutError, PENDING_MESSAGE } from "./client";

const input = { cartId: "gid://shopify/Cart/x", selectedAddressId: "a1", deliveryMethod: "uber_direct" as const };
const pay = { cpf: "12345678909", holderName: "FULANO", paymentToken: "tok" };

const httpError = (status: number, body: unknown) => ({ context: new Response(JSON.stringify(body), { status }) });

describe("alelo client", () => {
  beforeEach(() => invoke.mockReset());

  it("envia o contrato da edge cielo-checkout", async () => {
    invoke.mockResolvedValue({ data: { orderName: "#1", orderId: "9" }, error: null });
    await expect(payWithAlelo(input, pay)).resolves.toEqual({ orderName: "#1", orderId: "9" });
    expect(invoke).toHaveBeenCalledWith("cielo-checkout", {
      body: { cartId: input.cartId, addressId: "a1", deliveryMethod: "uber_direct", ...pay },
    });
  });

  it("envia expectedItems (inteiro) quando informado", async () => {
    invoke.mockResolvedValue({ data: { orderName: "#1", orderId: "9" }, error: null });
    await payWithAlelo({ ...input, expectedItems: 7 }, pay);
    expect(invoke).toHaveBeenCalledWith("cielo-checkout", {
      body: { cartId: input.cartId, addressId: "a1", deliveryMethod: "uber_direct", expectedItems: 7, ...pay },
    });
  });

  it("409 cart_out_of_sync expõe o code (message e userMessage do servidor)", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(409, { code: "cart_out_of_sync", message: "x", userMessage: "Seu carrinho mudou." }),
    });
    await expect(payWithAlelo(input, pay)).rejects.toMatchObject({ code: "cart_out_of_sync", status: 409 });
  });

  it("mapeia {code,message} do erro", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(402, { code: "declined_balance", message: "Saldo insuficiente." }) });
    await expect(payWithAlelo(input, pay)).rejects.toMatchObject({
      code: "declined_balance",
      userMessage: "Saldo insuficiente.",
      status: 402,
      pending: false,
    });
  });

  it("202 payment_pending vira erro pending com a mensagem fixa", async () => {
    invoke.mockResolvedValue({ data: { code: "payment_pending" }, error: null });
    const err = await payWithAlelo(input, pay).catch((e) => e);
    expect(err).toBeInstanceOf(AleloCheckoutError);
    expect(err).toMatchObject({ pending: true, code: "payment_pending", userMessage: PENDING_MESSAGE });
  });

  it("getSopToken falha em resposta incompleta", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(getSopToken("c")).rejects.toMatchObject({ code: "bad_response" });
  });
});
