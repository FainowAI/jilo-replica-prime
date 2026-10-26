/**
 * Cielo E-commerce FALSA (servidor Deno em loopback) para o E2E local e para
 * `fake-cielo.test.ts`. Use com `CIELO_ENV=mock` e `CIELO_MOCK_BASE_URL=<baseUrl>`.
 * Nada sai para a rede da Cielo. Não importa o cliente: é um dublê.
 *
 * Cenário pelo PaymentToken (substring, case-insensitive):
 *   SALDO    -> negado, ReturnCode 51
 *   INVALIDO -> negado, ReturnCode 57
 *   PENDENTE -> Status 12 (não terminal)
 *   TIMEOUT  -> cria a venda (como o gateway real) e só responde após `hangMs`
 *   outro    -> aprovado (Status 2, ReturnCode "00")
 *
 * Como a Cielo real, NÃO deduplica MerchantOrderId.
 * Nunca logar token/holder/headers.
 */

export interface FakeCieloSale {
  paymentId: string;
  merchantOrderId: string;
  amount: number;
  status: number;
  returnCode: string;
}

export interface FakeCielo {
  baseUrl: string;
  sales: Map<string, FakeCieloSale>;
  stop(): Promise<void>;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Corpo no formato da Cielo, incluindo o que o cliente DEVE descartar (CardNumber mascarado, Holder). */
function saleBody(s: FakeCieloSale) {
  return {
    MerchantOrderId: s.merchantOrderId,
    Customer: { Name: "TITULAR FAKE" },
    Payment: {
      PaymentId: s.paymentId,
      Type: "DebitCard",
      Amount: s.amount,
      Status: s.status,
      ReturnCode: s.returnCode,
      ReturnMessage: s.returnCode === "00" ? "Operation Successful" : "Denied",
      Tid: `TID${s.paymentId.slice(0, 8)}`,
      ProofOfSale: "123456",
      AuthorizationCode: s.status === 2 ? "654321" : undefined,
      DebitCard: { CardNumber: "508054******8044", Holder: "TITULAR FAKE", Brand: "Elo" },
      Links: [{ Method: "GET", Rel: "self", Href: "x" }],
    },
  };
}

export function startFakeCielo(opts: { hangMs?: number } = {}): FakeCielo {
  const hangMs = opts.hangMs ?? 31_000;
  const sales = new Map<string, FakeCieloSale>();

  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "POST" && path === "/oauth2/token") {
      if (!req.headers.get("Authorization")?.startsWith("Basic ")) return json({}, 401);
      return json({ access_token: "fake-bearer", token_type: "bearer", expires_in: 1199 });
    }
    if (req.method === "POST" && path === "/post/api/public/v2/accesstoken") {
      if (req.headers.get("Authorization") !== "Bearer fake-bearer" || !req.headers.get("MerchantId")) {
        return json({}, 401);
      }
      return json({
        MerchantId: req.headers.get("MerchantId"),
        AccessToken: "fake-sop-token",
        Issued: new Date().toISOString(),
        ExpiresDate: new Date(Date.now() + 20 * 60_000).toISOString(),
      });
    }

    // Demais rotas: credenciais do merchant.
    if (!req.headers.get("MerchantId") || !req.headers.get("MerchantKey")) return json([{ Code: 132 }], 401);

    if (req.method === "POST" && path === "/1/sales/") {
      const b = await req.json().catch(() => null);
      const pay = b?.Payment;
      const token = String(pay?.DebitCard?.PaymentToken ?? "");
      if (
        !b?.MerchantOrderId || pay?.Type !== "DebitCard" || pay?.DebitCard?.Brand !== "Elo" || !token ||
        !Number.isInteger(pay?.Amount)
      ) {
        return json([{ Code: 126, Message: "Invalid request" }], 400);
      }
      const t = token.toUpperCase();
      const s: FakeCieloSale = {
        paymentId: crypto.randomUUID(),
        merchantOrderId: b.MerchantOrderId,
        amount: pay.Amount,
        status: 2,
        returnCode: "00",
      };
      if (t.includes("SALDO")) Object.assign(s, { status: 3, returnCode: "51" });
      else if (t.includes("INVALIDO")) Object.assign(s, { status: 3, returnCode: "57" });
      else if (t.includes("PENDENTE")) Object.assign(s, { status: 12, returnCode: "0" });
      sales.set(s.paymentId, s);
      if (t.includes("TIMEOUT")) await new Promise((r) => setTimeout(r, hangMs));
      return json(saleBody(s), 201);
    }

    if (req.method === "GET" && path === "/1/sales") {
      const moid = url.searchParams.get("merchantOrderId");
      const Payments = [...sales.values()].filter((s) => s.merchantOrderId === moid).map((s) => ({
        PaymentId: s.paymentId,
        ReceivedDate: new Date().toISOString(),
      }));
      return json({ ReasonCode: 0, ReasonMessage: "Successful", Payments });
    }

    const m = path.match(/^\/1\/sales\/([^/]+)(\/void)?$/);
    if (m) {
      const s = sales.get(m[1]);
      if (!s) return json([{ Code: 404 }], 404);
      if (req.method === "GET" && !m[2]) return json(saleBody(s));
      if (req.method === "PUT" && m[2]) {
        if (Number(url.searchParams.get("amount")) !== s.amount) {
          return json([{ Code: 308, Message: "Only total void" }], 400);
        }
        s.status = 10;
        return json({ Status: 10, ReasonCode: 0, ReasonMessage: "Successful", ReturnCode: "0", ReturnMessage: "Operation Successful" });
      }
    }
    return json({}, 404);
  });

  return {
    baseUrl: `http://127.0.0.1:${server.addr.port}`,
    sales,
    stop: () => server.shutdown(),
  };
}
