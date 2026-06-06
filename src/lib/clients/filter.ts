import { formatClientDisplayName, formatReferredByName } from "@/lib/clients/names";
import type { ClientProfile } from "@/lib/types/clients";

export type ClientSortBy =
  | "name-asc"
  | "name-desc"
  | "code-asc"
  | "code-desc"
  | "joined-desc"
  | "joined-asc";

export const CLIENT_SORT_OPTIONS: { id: ClientSortBy; label: string }[] = [
  { id: "joined-desc", label: "Newest added" },
  { id: "joined-asc", label: "Oldest added" },
  { id: "name-asc", label: "Name A–Z" },
  { id: "name-desc", label: "Name Z–A" },
  { id: "code-asc", label: "Client code" },
  { id: "code-desc", label: "Client code (reverse)" },
];

export function sortClients(clients: ClientProfile[], sortBy: ClientSortBy): ClientProfile[] {
  return [...clients].sort((a, b) => {
    switch (sortBy) {
      case "name-desc":
        return formatClientDisplayName(b).localeCompare(formatClientDisplayName(a));
      case "code-asc":
        return (a.code || "").localeCompare(b.code || "");
      case "code-desc":
        return (b.code || "").localeCompare(a.code || "");
      case "joined-desc":
        return new Date(b.joined_at ?? 0).getTime() - new Date(a.joined_at ?? 0).getTime();
      case "joined-asc":
        return new Date(a.joined_at ?? 0).getTime() - new Date(b.joined_at ?? 0).getTime();
      case "name-asc":
      default:
        return formatClientDisplayName(a).localeCompare(formatClientDisplayName(b));
    }
  });
}

export function formatClientJoinedLabel(client: ClientProfile): string {
  if (!client.joined_at) return "—";
  return new Date(client.joined_at).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

export function filterClientsByBrand(
  clients: ClientProfile[],
  brandId: string | null | undefined
): ClientProfile[] {
  if (!brandId) return clients;
  return clients.filter((client) => client.brand_ids.includes(brandId));
}

export function searchClients(
  clients: ClientProfile[],
  query: string,
  options: { excludeContactFields?: boolean } = {}
): ClientProfile[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return clients;

  return clients.filter((client) => {
    const haystack = [
      formatClientDisplayName(client),
      client.first_name,
      client.middle_name,
      client.last_name,
      client.code,
      ...(options.excludeContactFields
        ? []
        : [
            client.email,
            client.phone,
            client.contact_person,
            formatReferredByName(client),
            client.country,
          ]),
      client.city,
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
