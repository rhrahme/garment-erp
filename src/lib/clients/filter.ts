import { formatClientDisplayName, formatReferredByName } from "@/lib/clients/names";
import type { ClientProfile } from "@/lib/types/clients";

export function filterClientsByBrand(
  clients: ClientProfile[],
  brandId: string | null | undefined
): ClientProfile[] {
  if (!brandId) return clients;
  return clients.filter((client) => client.brand_ids.includes(brandId));
}

export function searchClients(clients: ClientProfile[], query: string): ClientProfile[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return clients;

  return clients.filter((client) => {
    const haystack = [
      formatClientDisplayName(client),
      client.first_name,
      client.middle_name,
      client.last_name,
      client.code,
      client.email,
      client.phone,
      client.contact_person,
      formatReferredByName(client),
      client.country,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

export function filterPersonClients(clients: ClientProfile[]): ClientProfile[] {
  return clients.filter((client) => client.client_kind !== "retail_brand");
}
