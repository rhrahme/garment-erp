import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readClients, writeClients } from "@/lib/data/clients";
import { readPatternJobsFresh, writePatternJobs } from "@/lib/data/pattern-jobs";
import {
  isReadyMadeSalesOrder,
  readSalesOrdersFresh,
  writeSalesOrders,
} from "@/lib/data/sales-orders";
import { notifyIntegration } from "@/lib/integrations";
import {
  READY_MADE_BRANDS,
  retailBrandClientId,
  type ReadyMadeBrandDefinition,
} from "@/lib/integrations/clickup/ready-made-brands";
import type { ClientProfile } from "@/lib/types/clients";
import type { PatternJob } from "@/lib/types/pattern";
import type { SalesOrder } from "@/lib/types/sales-orders";

const ACTIVE_PATTERN_STATUSES = new Set([
  "pending",
  "assigned",
  "drafting",
  "awaiting_fitting",
  "revising",
  "ready_for_cutting",
  "blocked",
]);

export function findReadyMadeBrand(
  brandIdOrLabel: string
): ReadyMadeBrandDefinition | null {
  const raw = brandIdOrLabel.trim().toLowerCase();
  if (!raw) return null;
  return (
    READY_MADE_BRANDS.find(
      (brand) =>
        brand.id === raw ||
        brand.label.toLowerCase() === raw ||
        brand.aliases.includes(raw)
    ) ?? null
  );
}

export function applyReadyMadeBrandToOrder(
  order: SalesOrder,
  brand: ReadyMadeBrandDefinition,
  article?: string | null
): SalesOrder {
  const productArticle =
    article?.trim() ||
    order.product_article?.trim() ||
    order.fabric_lines[0]?.garment_type?.trim() ||
    "General";
  const note = `Moved to Ready-Made / ${brand.label} (${productArticle} size run).`;
  const notes = order.notes?.includes("Moved to Ready-Made")
    ? order.notes
    : [order.notes?.trim(), note].filter(Boolean).join("\n");
  return {
    ...order,
    retail_brand: brand.label,
    client_id: retailBrandClientId(brand.id),
    client_code: brand.client_code,
    client_name: brand.label,
    product_article: productArticle,
    client_reference: `${brand.client_code}-${order.so_number}`,
    notes,
  };
}

export function cancelPatternJobsForReadyMadeOrders(
  jobs: PatternJob[],
  orderIds: Set<string>,
  nowIso: string
): { jobs: PatternJob[]; cancelled_ids: string[] } {
  const cancelled_ids: string[] = [];
  const next = jobs.map((job) => {
    if (!orderIds.has(job.sales_order_id)) return job;
    if (!ACTIVE_PATTERN_STATUSES.has(job.status)) return job;
    cancelled_ids.push(job.id);
    return {
      ...job,
      status: "cancelled" as const,
      notes: [job.notes?.trim(), "Cancelled - ready-made size run, not a bespoke pattern job."]
        .filter(Boolean)
        .join("\n"),
      updated_at: nowIso,
    };
  });
  return { jobs: next, cancelled_ids };
}

export function hideMiscreatedReadyMadePersonClients(
  clients: ClientProfile[],
  previousClientIds: string[]
): ClientProfile[] {
  const hide = new Set(previousClientIds.filter(Boolean));
  if (hide.size === 0) return clients;
  return clients.map((client) => {
    if (!hide.has(client.id)) return client;
    if (client.client_kind === "retail_brand") return client;
    return {
      ...client,
      client_kind: "retail_brand" as const,
      is_active: false,
      notes: [
        client.notes?.trim(),
        "Mis-created as a person client for a Ready-Made size run. Orders moved to the retail brand account.",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  });
}

export async function markSalesOrderReadyMade(input: {
  order_id: string;
  brand: string;
  article?: string | null;
  acted_by: string;
  source?: "erp" | "api";
}): Promise<
  | {
      ok: true;
      order: SalesOrder;
      cancelled_job_ids: string[];
      previous_client_id: string;
    }
  | { ok: false; status: number; error: string }
> {
  await ensureDocumentsLoaded(["sales_orders", "clients", "pattern_jobs"]);
  const brand = findReadyMadeBrand(input.brand);
  if (!brand) {
    return { ok: false, status: 400, error: "Pick a Ready-Made brand (Boggi, Massimo Dutti, Suit Supply, ...)." };
  }

  const soStore = await readSalesOrdersFresh();
  const index = soStore.orders.findIndex((row) => row.id === input.order_id.trim());
  if (index < 0) return { ok: false, status: 404, error: "Sales order not found." };
  const current = soStore.orders[index]!;
  if (isReadyMadeSalesOrder(current) && current.client_id === retailBrandClientId(brand.id)) {
    return { ok: true, order: current, cancelled_job_ids: [], previous_client_id: current.client_id };
  }

  const previousClientId = current.client_id;
  const nextOrder = applyReadyMadeBrandToOrder(current, brand, input.article);
  soStore.orders[index] = nextOrder;
  await writeSalesOrders(soStore);

  const nowIso = new Date().toISOString();
  const jobsStore = await readPatternJobsFresh();
  const cancelled = cancelPatternJobsForReadyMadeOrders(
    jobsStore.jobs,
    new Set([nextOrder.id]),
    nowIso
  );
  if (cancelled.cancelled_ids.length > 0) {
    await writePatternJobs({ ...jobsStore, jobs: cancelled.jobs });
  }

  if (previousClientId && previousClientId !== nextOrder.client_id) {
    const clientsStore = readClients();
    const stillUsed = soStore.orders.some(
      (row) => row.client_id === previousClientId && row.id !== nextOrder.id && !isReadyMadeSalesOrder(row)
    );
    if (!stillUsed) {
      await writeClients({
        ...clientsStore,
        clients: hideMiscreatedReadyMadePersonClients(clientsStore.clients, [previousClientId]),
      });
    }
  }

  const source = input.source ?? "erp";
  try {
    await notifyIntegration(
      "sales_order.marked_ready_made",
      {
        order_id: nextOrder.id,
        so_number: nextOrder.so_number,
        retail_brand: nextOrder.retail_brand,
        product_article: nextOrder.product_article,
        previous_client_id: previousClientId,
        cancelled_job_ids: cancelled.cancelled_ids,
        acted_by: input.acted_by,
      },
      source
    );
  } catch (error) {
    console.error("Failed to notify sales_order.marked_ready_made:", nextOrder.id, error);
  }

  return {
    ok: true,
    order: nextOrder,
    cancelled_job_ids: cancelled.cancelled_ids,
    previous_client_id: previousClientId,
  };
}
