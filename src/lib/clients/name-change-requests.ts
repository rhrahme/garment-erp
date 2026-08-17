import {
  clientNamesEqual,
  type ClientNameParts,
} from "@/lib/clients/name-permissions";
import { formatClientDisplayName, normalizeNamePart } from "@/lib/clients/names";
import { readClients, writeClients } from "@/lib/data/clients";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { notifyIntegration } from "@/lib/integrations";
import { notifyAdminsOfClientNameChangeRequest } from "@/lib/integrations/client-name-change-alert";
import type { ClientProfile } from "@/lib/types/clients";

export type ClientNameChangeRequestSummary = {
  client_id: string;
  client_code: string;
  current_name: string;
  proposed_name: string;
  proposed_first_name: string;
  proposed_middle_name: string | null;
  proposed_last_name: string;
  requested_by: string;
  requested_at: string;
};

export function isClientNameChangePending(
  client: Pick<ClientProfile, "name_change_requested_at">
): boolean {
  return Boolean(client.name_change_requested_at);
}

function normalizeMiddle(value: string | null | undefined): string | null {
  const trimmed = normalizeNamePart(value);
  return trimmed.length > 0 ? trimmed : null;
}

export function buildClientNameChangeRequestSummary(
  client: ClientProfile
): ClientNameChangeRequestSummary | null {
  if (!isClientNameChangePending(client)) return null;
  const proposed: ClientNameParts = {
    first_name: client.name_change_first_name ?? "",
    middle_name: client.name_change_middle_name ?? null,
    last_name: client.name_change_last_name ?? "",
  };
  return {
    client_id: client.id,
    client_code: client.code,
    current_name: formatClientDisplayName(client),
    proposed_name: formatClientDisplayName(proposed),
    proposed_first_name: proposed.first_name,
    proposed_middle_name: proposed.middle_name,
    proposed_last_name: proposed.last_name,
    requested_by: client.name_change_requested_by ?? "unknown",
    requested_at: client.name_change_requested_at!,
  };
}

export function listPendingClientNameChangeRequests(
  clients: ClientProfile[] = readClients().clients
): ClientNameChangeRequestSummary[] {
  return clients
    .map(buildClientNameChangeRequestSummary)
    .filter((summary): summary is ClientNameChangeRequestSummary => summary !== null)
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at));
}

/**
 * Pure: validate + stamp a name-change request onto a client.
 * A pending request is overwritten (latest proposal wins) so the requester
 * can fix a typo without an admin round-trip.
 */
export function applyNameChangeRequest(
  client: ClientProfile,
  proposed: ClientNameParts,
  actor: string,
  nowIso: string = new Date().toISOString()
): { ok: true; client: ClientProfile } | { ok: false; status: number; error: string } {
  const first = normalizeNamePart(proposed.first_name);
  const last = normalizeNamePart(proposed.last_name);
  const middle = normalizeMiddle(proposed.middle_name);
  if (!first || !last) {
    return { ok: false, status: 400, error: "Proposed name needs a first and last name." };
  }
  if (clientNamesEqual(client, { first_name: first, middle_name: middle, last_name: last })) {
    return { ok: false, status: 400, error: "Proposed name is the same as the current name." };
  }
  return {
    ok: true,
    client: {
      ...client,
      name_change_requested_at: nowIso,
      name_change_requested_by: actor,
      name_change_first_name: first,
      name_change_middle_name: middle,
      name_change_last_name: last,
    },
  };
}

/** Pure: apply the proposed name and clear the request. */
export function applyNameChangeApproval(
  client: ClientProfile
): { ok: true; client: ClientProfile } | { ok: false; status: number; error: string } {
  if (!isClientNameChangePending(client)) {
    return { ok: false, status: 400, error: "No pending name change request for this client." };
  }
  const first = normalizeNamePart(client.name_change_first_name);
  const last = normalizeNamePart(client.name_change_last_name);
  if (!first || !last) {
    return { ok: false, status: 400, error: "Pending request is missing a first or last name." };
  }
  return {
    ok: true,
    client: {
      ...clearRequestFields(client),
      first_name: first,
      middle_name: normalizeMiddle(client.name_change_middle_name),
      last_name: last,
    },
  };
}

/** Pure: drop the pending request, keep the current name. */
export function applyNameChangeRejection(client: ClientProfile): ClientProfile {
  return clearRequestFields(client);
}

function clearRequestFields(client: ClientProfile): ClientProfile {
  return {
    ...client,
    name_change_requested_at: null,
    name_change_requested_by: null,
    name_change_first_name: null,
    name_change_middle_name: null,
    name_change_last_name: null,
  };
}

type MutateResult =
  | { ok: true; client: ClientProfile; summary: ClientNameChangeRequestSummary | null }
  | { ok: false; status: number; error: string };

async function mutateClient(
  clientId: string,
  mutate: (client: ClientProfile) =>
    | { ok: true; client: ClientProfile }
    | { ok: false; status: number; error: string }
): Promise<MutateResult> {
  await ensureDocumentsLoaded(["clients", "sales_orders"]);
  const store = readClients();
  const index = store.clients.findIndex((client) => client.id === clientId);
  if (index < 0) {
    return { ok: false, status: 404, error: "Client not found." };
  }
  const result = mutate(store.clients[index]!);
  if (!result.ok) return result;

  const nextClients = store.clients.map((client, idx) => (idx === index ? result.client : client));
  const saved = await writeClients({ updated_at: null, clients: nextClients });
  const savedClient = saved.clients.find((client) => client.id === clientId) ?? result.client;
  return { ok: true, client: savedClient, summary: buildClientNameChangeRequestSummary(savedClient) };
}

/** QC/non-admin: propose a new name. Emails admins + fires client.name_change_requested. */
export async function requestClientNameChange(
  clientId: string,
  actor: string,
  proposed: ClientNameParts
): Promise<MutateResult> {
  const result = await mutateClient(clientId, (client) =>
    applyNameChangeRequest(client, proposed, actor)
  );
  if (!result.ok) return result;

  const summary = result.summary!;
  await notifyAdminsOfClientNameChangeRequest(summary);
  await notifyIntegration("client.name_change_requested", {
    client_id: summary.client_id,
    client_code: summary.client_code,
    current_name: summary.current_name,
    proposed_name: summary.proposed_name,
    requested_by: actor,
  });
  return result;
}

/** Admin: apply the proposed name. Fires client.name_change_approved + client.updated. */
export async function approveClientNameChange(clientId: string, actor: string): Promise<MutateResult> {
  const before = readClients().clients.find((client) => client.id === clientId);
  const pendingSummary = before ? buildClientNameChangeRequestSummary(before) : null;

  const result = await mutateClient(clientId, applyNameChangeApproval);
  if (!result.ok) return result;

  await notifyIntegration("client.name_change_approved", {
    client_id: result.client.id,
    client_code: result.client.code,
    previous_name: pendingSummary?.current_name ?? null,
    new_name: formatClientDisplayName(result.client),
    requested_by: pendingSummary?.requested_by ?? null,
    approved_by: actor,
  });
  await notifyIntegration("client.updated", {
    id: result.client.id,
    code: result.client.code,
    first_name: result.client.first_name,
    middle_name: result.client.middle_name,
    last_name: result.client.last_name,
    via: "name_change_approved",
  });
  return result;
}

/** Admin reject (or requester cancel): keep current name, drop the request. */
export async function rejectClientNameChange(
  clientId: string,
  actor: string,
  options: { asCancel?: boolean } = {}
): Promise<MutateResult> {
  const before = readClients().clients.find((client) => client.id === clientId);
  const pendingSummary = before ? buildClientNameChangeRequestSummary(before) : null;
  if (before && !isClientNameChangePending(before)) {
    return { ok: true, client: before, summary: null };
  }

  const result = await mutateClient(clientId, (client) => ({
    ok: true,
    client: applyNameChangeRejection(client),
  }));
  if (!result.ok) return result;

  if (!options.asCancel) {
    await notifyIntegration("client.name_change_rejected", {
      client_id: result.client.id,
      client_code: result.client.code,
      current_name: formatClientDisplayName(result.client),
      proposed_name: pendingSummary?.proposed_name ?? null,
      requested_by: pendingSummary?.requested_by ?? null,
      rejected_by: actor,
    });
  }
  return result;
}
