import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ data: null }) }));
vi.mock("@/lib/alelo/client", async (orig) => ({ ...(await orig<object>()), getSopToken: vi.fn(), payWithAlelo: vi.fn() }));

import AleloCardDialog from "./AleloCardDialog";
import { getSopToken } from "@/lib/alelo/client";

const renderDialog = () =>
  render(
    <MemoryRouter>
      <AleloCardDialog
        open
        onOpenChange={() => {}}
        checkout={{ cartId: "gid://shopify/Cart/x", selectedAddressId: "a", deliveryMethod: "uber_direct" }}
      />
    </MemoryRouter>,
  );

// Preenche nome + CPF válido + mês/ano e envia o form (fireEvent.submit pula a validação nativa de `required`).
const fillAndSubmit = (mes: string, ano: string) => {
  fireEvent.change(document.querySelector("input.bp-sop-cardholdername")!, { target: { value: "FULANO DE TAL" } });
  fireEvent.change(screen.getByText("CPF do titular").parentElement!.querySelector("input")!, {
    target: { value: "529.982.247-25" },
  });
  fireEvent.change(screen.getByLabelText("Mês"), { target: { value: mes } });
  fireEvent.change(screen.getByLabelText("Ano"), { target: { value: ano } });
  fireEvent.submit(document.querySelector("form")!);
};

describe("AleloCardDialog (H5)", () => {
  it("campos do cartão são DOM não controlado com classes SOP e ph-no-capture", () => {
    renderDialog();
    const num = document.querySelector<HTMLInputElement>("input.bp-sop-cardnumber")!;
    const cvv = document.querySelector<HTMLInputElement>("input.bp-sop-cardcvvc")!;
    expect(document.querySelector("input.bp-sop-cardholdername")).toBeTruthy();
    expect(document.querySelector("input.bp-sop-cardexpirationdate")).toBeTruthy();
    expect(cvv.type).toBe("text");
    expect(cvv.getAttribute("autocomplete")).toBe("cc-csc");
    expect(document.querySelector(".ph-no-capture")).toBeTruthy();

    // Não controlado: o valor digitado vive só no DOM (um input controlado sem estado ignoraria a digitação
    // ou seria reescrito por máscara) e é preservado como digitado, sem formatação vinda de state.
    fireEvent.change(num, { target: { value: "4111 1111" } });
    expect(num.value).toBe("4111 1111");
  });
});

describe("AleloCardDialog — validade em Mês + Ano", () => {
  beforeEach(() => vi.mocked(getSopToken).mockReset());
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as Window & { bpSop_silentOrderPost?: unknown }).bpSop_silentOrderPost;
  });

  it("mostra os quadrados Mês e Ano, com botão de lista e autocomplete cc-exp-*", () => {
    renderDialog();
    const mes = screen.getByLabelText("Mês") as HTMLInputElement;
    const ano = screen.getByLabelText("Ano") as HTMLInputElement;
    expect(mes.placeholder).toBe("MM");
    expect(mes.getAttribute("autocomplete")).toBe("cc-exp-month");
    expect(mes.inputMode).toBe("numeric");
    expect(ano.placeholder).toBe("AAAA");
    expect(ano.getAttribute("autocomplete")).toBe("cc-exp-year");
    expect(ano.inputMode).toBe("numeric");
    expect(screen.getByRole("button", { name: "Escolher mês" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Escolher ano" })).toBeTruthy();

    // O SOP continua lendo um input de texto (não hidden) com a classe bp-sop-cardexpirationdate.
    const sop = document.querySelector<HTMLInputElement>("input.bp-sop-cardexpirationdate")!;
    expect(sop.type).toBe("text");
    expect(sop.readOnly).toBe(true);
  });

  it("só aceita dígitos e passa o foco para o Ano ao completar um mês válido", () => {
    renderDialog();
    const mes = screen.getByLabelText("Mês") as HTMLInputElement;
    const ano = screen.getByLabelText("Ano") as HTMLInputElement;
    fireEvent.change(mes, { target: { value: "0/7" } });
    expect(mes.value).toBe("07");
    expect(document.activeElement).toBe(ano);
    fireEvent.change(ano, { target: { value: "20a34" } });
    expect(ano.value).toBe("2034");
  });

  it("a lista suspensa preenche o quadrado, fecha e marca o item escolhido", async () => {
    // O Popper (floating-ui) do Radix precisa de ResizeObserver, que o jsdom não tem.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    renderDialog();
    const mes = screen.getByLabelText("Mês") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Escolher mês" }));
    const julho = await screen.findByRole("button", { name: "07 Jul" });
    expect(julho.closest(".ph-no-capture")).toBeTruthy(); // lista vai por Portal: precisa do próprio ph-no-capture
    fireEvent.click(julho);
    expect(mes.value).toBe("07");
    await waitFor(() => expect(screen.queryByRole("button", { name: "07 Jul" })).toBeNull());

    const ano = screen.getByLabelText("Ano") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Escolher ano" }));
    const anoFuturo = String(new Date().getFullYear() + 15); // último da grade
    fireEvent.click(await screen.findByRole("button", { name: anoFuturo }));
    expect(ano.value).toBe(anoFuturo);

    fireEvent.click(screen.getByRole("button", { name: "Escolher mês" }));
    expect((await screen.findByRole("button", { name: "07 Jul" })).getAttribute("aria-pressed")).toBe("true");
  });

  it("validade inválida mostra a mensagem e não chama o SOP", async () => {
    renderDialog();
    fillAndSubmit("13", "2099");
    expect(await screen.findByText("Confira a validade do cartão (mês e ano).")).toBeTruthy();
    expect(getSopToken).not.toHaveBeenCalled();
  });

  it("validade vencida também bloqueia antes do SOP", async () => {
    renderDialog();
    fillAndSubmit("01", "2020");
    expect(await screen.findByText("Confira a validade do cartão (mês e ano).")).toBeTruthy();
    expect(getSopToken).not.toHaveBeenCalled();
  });

  it("validade válida preenche o input do SOP com MM/AAAA antes de chamar o SOP", async () => {
    vi.mocked(getSopToken).mockResolvedValue({ accessToken: "tok", environment: "sandbox" } as never);
    let valorNoSop: string | undefined;
    (window as Window & { bpSop_silentOrderPost?: unknown }).bpSop_silentOrderPost = vi.fn(() => {
      valorNoSop = document.querySelector<HTMLInputElement>("input.bp-sop-cardexpirationdate")!.value;
    });
    renderDialog();
    fillAndSubmit("7", "2099");
    await waitFor(() => expect(valorNoSop).toBe("07/2099"));
  });
});
