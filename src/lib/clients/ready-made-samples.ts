import { deleteClientSampleImage } from "@/lib/data/client-sample-storage";
import { getClientById, readClients, writeClients } from "@/lib/data/clients";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { findPayrollEmployeeByBadgeValue } from "@/lib/hr/payroll-lookup";
import { notifyIntegration } from "@/lib/integrations";
import type {
  ClientProfile,
  ClientReadyMadeSample,
  ClientReadyMadeSampleImage,
} from "@/lib/types/clients";

type ResultOk<T> = { ok: true } & T;
type ResultErr = { ok: false; status: number; error: string };
type Result<T> = ResultOk<T> | ResultErr;

function normalizeText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export function findSampleAcrossClients(
  sampleId: string
): { client: ClientProfile; sample: ClientReadyMadeSample } | null {
  for (const client of readClients().clients) {
    const sample = (client.ready_made_samples ?? []).find((row) => row.id === sampleId);
    if (sample) return { client, sample };
  }
  return null;
}

async function persistSamples(
  clientId: string,
  mutate: (samples: ClientReadyMadeSample[]) => ClientReadyMadeSample[]
): Promise<Result<{ client: ClientProfile }>> {
  await ensureDocumentsLoaded(["clients", "sales_orders"]);
  const store = readClients();
  const index = store.clients.findIndex((row) => row.id === clientId);
  if (index < 0) return { ok: false, status: 404, error: "Client not found." };
  const client = store.clients[index]!;
  const next: ClientProfile = {
    ...client,
    ready_made_samples: mutate(structuredClone(client.ready_made_samples ?? [])),
  };
  const clients = [...store.clients];
  clients[index] = next;
  await writeClients({ ...store, clients });
  return { ok: true, client: next };
}

export type AddReadyMadeSampleInput = {
  client_id: string;
  product_type?: unknown;
  brand?: unknown;
  color?: unknown;
  size?: unknown;
  notes?: unknown;
  /** Raw badge scan (QR payload or ID number) of the employee receiving it. */
  received_by_badge?: unknown;
  /** API fallback when no badge scanner is available (Zapier). */
  received_by_name?: unknown;
  added_by: string | null;
};

export async function addReadyMadeSample(
  input: AddReadyMadeSampleInput,
  source: "erp" | "api" = "erp"
): Promise<Result<{ sample: ClientReadyMadeSample }>> {
  await ensureDocumentsLoaded(["clients", "payroll_employees"]);
  const client = getClientById(String(input.client_id ?? "").trim());
  if (!client) return { ok: false, status: 404, error: "Client not found." };

  const badgeValue = String(input.received_by_badge ?? "").trim();
  const fallbackName = normalizeText(input.received_by_name);
  let receivedById: string | null = null;
  let receivedByName: string | null = null;
  if (badgeValue) {
    const employee = findPayrollEmployeeByBadgeValue(badgeValue);
    if (!employee) {
      return {
        ok: false,
        status: 400,
        error: "Badge not recognized. Scan your employee ID badge again.",
      };
    }
    receivedById = employee.id;
    receivedByName = employee.full_name;
  } else if (fallbackName && source === "api") {
    receivedByName = fallbackName;
  } else {
    return {
      ok: false,
      status: 400,
      error: "The person receiving the sample must scan their employee ID badge.",
    };
  }

  const sample: ClientReadyMadeSample = {
    id: `crs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    product_type: normalizeText(input.product_type),
    brand: normalizeText(input.brand),
    color: normalizeText(input.color),
    size: normalizeText(input.size),
    notes: normalizeText(input.notes),
    images: [],
    received_by_employee_id: receivedById,
    received_by_employee_name: receivedByName,
    added_by: input.added_by,
    added_at: new Date().toISOString(),
    returned_at: null,
    returned_by: null,
  };

  const persisted = await persistSamples(client.id, (samples) => [sample, ...samples]);
  if (!persisted.ok) return persisted;

  try {
    await notifyIntegration(
      "client.ready_made_sample_added",
      {
        sample_id: sample.id,
        client_id: client.id,
        client_code: client.code,
        product_type: sample.product_type,
        brand: sample.brand,
        color: sample.color,
        size: sample.size,
        received_by: sample.received_by_employee_name,
        added_by: sample.added_by,
        added_at: sample.added_at,
      },
      source
    );
  } catch {
    /* non-fatal */
  }
  return { ok: true, sample };
}

export type UpdateReadyMadeSamplePatch = {
  product_type?: unknown;
  brand?: unknown;
  color?: unknown;
  size?: unknown;
  notes?: unknown;
  /** true marks the sample as handed back to the client. */
  returned?: unknown;
};

export async function updateReadyMadeSample(
  sampleId: string,
  patch: UpdateReadyMadeSamplePatch,
  actor: string | null,
  source: "erp" | "api" = "erp"
): Promise<Result<{ sample: ClientReadyMadeSample }>> {
  await ensureDocumentsLoaded(["clients"]);
  const found = findSampleAcrossClients(sampleId);
  if (!found) return { ok: false, status: 404, error: "Sample not found." };

  let updated: ClientReadyMadeSample = found.sample;
  const persisted = await persistSamples(found.client.id, (samples) =>
    samples.map((row) => {
      if (row.id !== sampleId) return row;
      updated = {
        ...row,
        product_type:
          patch.product_type === undefined ? row.product_type : normalizeText(patch.product_type),
        brand: patch.brand === undefined ? row.brand : normalizeText(patch.brand),
        color: patch.color === undefined ? row.color : normalizeText(patch.color),
        size: patch.size === undefined ? row.size : normalizeText(patch.size),
        notes: patch.notes === undefined ? row.notes : normalizeText(patch.notes),
        returned_at:
          patch.returned === undefined
            ? row.returned_at
            : patch.returned
              ? (row.returned_at ?? new Date().toISOString())
              : null,
        returned_by:
          patch.returned === undefined ? row.returned_by : patch.returned ? actor : null,
      };
      return updated;
    })
  );
  if (!persisted.ok) return persisted;

  try {
    await notifyIntegration(
      patch.returned ? "client.ready_made_sample_returned" : "client.ready_made_sample_updated",
      {
        sample_id: updated.id,
        client_id: found.client.id,
        client_code: found.client.code,
        returned_at: updated.returned_at,
        updated_by: actor,
      },
      source
    );
  } catch {
    /* non-fatal */
  }
  return { ok: true, sample: updated };
}

export async function deleteReadyMadeSample(
  sampleId: string,
  actor: string | null,
  source: "erp" | "api" = "erp"
): Promise<Result<{ deleted: true }>> {
  await ensureDocumentsLoaded(["clients"]);
  const found = findSampleAcrossClients(sampleId);
  if (!found) return { ok: false, status: 404, error: "Sample not found." };

  const persisted = await persistSamples(found.client.id, (samples) =>
    samples.filter((row) => row.id !== sampleId)
  );
  if (!persisted.ok) return persisted;

  for (const image of found.sample.images) {
    try {
      await deleteClientSampleImage(image.stored_filename);
    } catch {
      /* best-effort storage cleanup */
    }
  }

  try {
    await notifyIntegration(
      "client.ready_made_sample_deleted",
      {
        sample_id: sampleId,
        client_id: found.client.id,
        client_code: found.client.code,
        deleted_by: actor,
      },
      source
    );
  } catch {
    /* non-fatal */
  }
  return { ok: true, deleted: true };
}

export async function attachReadyMadeSampleImage(
  sampleId: string,
  image: ClientReadyMadeSampleImage
): Promise<Result<{ sample: ClientReadyMadeSample }>> {
  await ensureDocumentsLoaded(["clients"]);
  const found = findSampleAcrossClients(sampleId);
  if (!found) return { ok: false, status: 404, error: "Sample not found." };

  let updated: ClientReadyMadeSample = found.sample;
  const persisted = await persistSamples(found.client.id, (samples) =>
    samples.map((row) => {
      if (row.id !== sampleId) return row;
      updated = { ...row, images: [...row.images, image] };
      return updated;
    })
  );
  if (!persisted.ok) return persisted;
  return { ok: true, sample: updated };
}

export async function removeReadyMadeSampleImage(
  sampleId: string,
  imageId: string
): Promise<Result<{ sample: ClientReadyMadeSample }>> {
  await ensureDocumentsLoaded(["clients"]);
  const found = findSampleAcrossClients(sampleId);
  if (!found) return { ok: false, status: 404, error: "Sample not found." };
  const image = found.sample.images.find((row) => row.id === imageId);
  if (!image) return { ok: false, status: 404, error: "Image not found." };

  let updated: ClientReadyMadeSample = found.sample;
  const persisted = await persistSamples(found.client.id, (samples) =>
    samples.map((row) => {
      if (row.id !== sampleId) return row;
      updated = { ...row, images: row.images.filter((item) => item.id !== imageId) };
      return updated;
    })
  );
  if (!persisted.ok) return persisted;

  try {
    await deleteClientSampleImage(image.stored_filename);
  } catch {
    /* best-effort storage cleanup */
  }
  return { ok: true, sample: updated };
}
