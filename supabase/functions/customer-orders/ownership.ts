/** The profile's Shopify GID is user writable, so its shape alone proves nothing. */
export async function verifiedCustomerNumericId(
  profileGid: string | null | undefined,
  jwtEmail: string,
  lookup: (id: string) => Promise<{ id: string; email: string | null } | null>,
): Promise<string | null> {
  const id = profileGid ?? "";
  const match = /^gid:\/\/shopify\/Customer\/(\d+)$/.exec(id);
  if (!match) return null;
  try {
    const customer = await lookup(id);
    return customer && customer.id === id && customer.email?.trim().toLowerCase() === jwtEmail.trim().toLowerCase()
      ? match[1]
      : null;
  } catch {
    return null;
  }
}
