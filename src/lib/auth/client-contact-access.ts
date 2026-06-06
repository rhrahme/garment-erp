import type { ClientProfile, ClientsFile } from "@/lib/types/clients";

/** Fields QC / client-manager accounts must not see or change. */
export type RestrictedClientFields = Pick<
  ClientProfile,
  | "email"
  | "phone"
  | "contact_person"
  | "referred_by_first_name"
  | "referred_by_middle_name"
  | "referred_by_last_name"
  | "country"
>;

export function redactClientContact<T extends RestrictedClientFields>(client: T): T {
  return {
    ...client,
    email: null,
    phone: null,
    contact_person: null,
    referred_by_first_name: null,
    referred_by_middle_name: null,
    referred_by_last_name: null,
    country: null,
  };
}

export function redactClientsFile(data: ClientsFile): ClientsFile {
  return {
    ...data,
    clients: data.clients.map(redactClientContact),
  };
}

export function preserveStoredClientContact(
  incoming: ClientProfile[],
  previous: ClientProfile[]
): ClientProfile[] {
  const previousById = new Map(previous.map((client) => [client.id, client]));
  return incoming.map((client) => {
    const stored = previousById.get(client.id);
    if (!stored) {
      return redactClientContact(client);
    }
    return {
      ...client,
      email: stored.email,
      phone: stored.phone,
      contact_person: stored.contact_person,
      referred_by_first_name: stored.referred_by_first_name,
      referred_by_middle_name: stored.referred_by_middle_name,
      referred_by_last_name: stored.referred_by_last_name,
      country: stored.country,
    };
  });
}
