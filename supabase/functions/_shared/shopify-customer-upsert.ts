/**
 * Upsert de customer na Shopify Admin API (2025-10) por e-mail.
 * `customerCreate` NÃO aceita `identifier` nessa versão, então: busca por e-mail,
 * `customerUpdate` se achou (tags = união, note intacta), `customerCreate` senão.
 * `callAdmin` é injetado (testável sem rede). Erros lançados são curtos, sem PII.
 */
export type CallAdmin = (payload: { query: string; variables?: object }) => Promise<Response>;

export interface CustomerUpsertInput {
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  tags: string[];
  note: string;
}

export interface CustomerUpsertResult {
  customerId: string;
  action: "linked" | "created";
}

type UserError = { field?: string[] | null; message: string };

const FIND_QUERY = `
  query findCustomer($q: String!) {
    customers(first: 1, query: $q) { edges { node { id email tags } } }
  }
`;
const UPDATE_MUTATION = `
  mutation customerUpdate($input: CustomerInput!) {
    customerUpdate(input: $input) { customer { id } userErrors { field message } }
  }
`;
const CREATE_MUTATION = `
  mutation customerCreate($input: CustomerInput!) {
    customerCreate(input: $input) { customer { id } userErrors { field message } }
  }
`;

// deno-lint-ignore no-explicit-any
async function gql(callAdmin: CallAdmin, query: string, variables: object): Promise<any> {
  const res = await callAdmin({ query, variables });
  if (!res.ok) throw new Error(`shopify_http_${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error("shopify_graphql_errors");
  if (!json.data) throw new Error("shopify_bad_response");
  return json.data;
}

const isPhoneError = (errs: UserError[]) => errs.some((e) => e.field?.includes("phone"));

export async function upsertShopifyCustomer(
  callAdmin: CallAdmin,
  input: CustomerUpsertInput,
): Promise<CustomerUpsertResult> {
  // Mesmo guard de customer-orders: fecha injeção de termo na DSL de busca.
  if (/["'\s:()*?]/.test(input.email) || /[\r\n]/.test(input.email)) {
    throw new Error("invalid_email");
  }

  const found = await gql(callAdmin, FIND_QUERY, { q: `email:${input.email}` });
  const existing = found.customers?.edges?.[0]?.node as { id: string; tags?: string[] } | undefined;

  const mutation = existing ? UPDATE_MUTATION : CREATE_MUTATION;
  const key = existing ? "customerUpdate" : "customerCreate";
  const base = existing
    ? {
        id: existing.id,
        firstName: input.firstName,
        lastName: input.lastName,
        tags: [...new Set([...(existing.tags ?? []), ...input.tags])],
      }
    : { email: input.email, firstName: input.firstName, lastName: input.lastName, tags: input.tags, note: input.note };

  const run = async (withPhone: boolean) => {
    const payload = withPhone && input.phone ? { ...base, phone: input.phone } : base;
    const data = await gql(callAdmin, mutation, { input: payload });
    return data[key] as { customer?: { id: string }; userErrors?: UserError[] } | undefined;
  };

  let result = await run(true);
  let errs = result?.userErrors ?? [];
  // Telefone inválido não pode impedir o vínculo: uma nova tentativa sem phone.
  if (errs.length > 0 && input.phone && isPhoneError(errs)) {
    result = await run(false);
    errs = result?.userErrors ?? [];
  }
  if (errs.length > 0) {
    // Só os campos com erro (mensagens podem ecoar PII).
    throw new Error(`shopify_user_errors:${errs.map((e) => e.field?.join(".") ?? "?").join(",")}`);
  }
  const customerId = result?.customer?.id;
  if (!customerId) throw new Error("shopify_no_customer_id");
  return { customerId, action: existing ? "linked" : "created" };
}
