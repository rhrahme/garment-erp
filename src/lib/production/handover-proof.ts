import {
  attachReadyMadeSampleHandoverProof,
  findSampleAcrossClients,
} from "@/lib/clients/ready-made-samples";
import { deleteHandoverProofImage } from "@/lib/data/handover-proof-storage";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  getProductionWorkOrderById,
  readProductionWorkOrders,
  writeProductionWorkOrders,
} from "@/lib/data/production-work-orders";
import type { SessionContext } from "@/lib/auth/session";
import type { ClientProfile, ClientReadyMadeSample } from "@/lib/types/clients";
import type { ProductionWorkOrder } from "@/lib/types/production";
import {
  isHandoverProofTarget,
  type HandoverProofImage,
  type HandoverProofTarget,
} from "@/lib/production/garment-handover";

type ResultOk<T> = { ok: true } & T;
type ResultErr = { ok: false; status: number; error: string };
type Result<T> = ResultOk<T> | ResultErr;

export type LoadedHandoverProofTarget =
  | { kind: "work_order"; workOrder: ProductionWorkOrder }
  | { kind: "sample"; client: ClientProfile; sample: ClientReadyMadeSample };

export function canWriteWorkOrderHandoverProof(
  session: Pick<
    SessionContext,
    | "isSuperAdmin"
    | "isAdmin"
    | "isClientManager"
    | "isProductionOperator"
    | "isPatternOperator"
    | "isTaskOperator"
  >
): boolean {
  return (
    session.isSuperAdmin ||
    session.isAdmin ||
    session.isClientManager ||
    session.isProductionOperator ||
    session.isPatternOperator ||
    session.isTaskOperator
  );
}

export async function loadHandoverProofTarget(
  target: string,
  targetId: string
): Promise<Result<LoadedHandoverProofTarget>> {
  if (!isHandoverProofTarget(target)) {
    return { ok: false, status: 400, error: "Unknown handover proof target." };
  }
  const id = String(targetId ?? "").trim();
  if (!id) return { ok: false, status: 400, error: "target_id is required." };

  if (target === "work_order") {
    await ensureDocumentsLoaded(["production_work_orders"]);
    const workOrder = getProductionWorkOrderById(id);
    if (!workOrder) return { ok: false, status: 404, error: "Work order not found." };
    return { ok: true, kind: "work_order", workOrder };
  }

  await ensureDocumentsLoaded(["clients"]);
  const found = findSampleAcrossClients(id);
  if (!found) return { ok: false, status: 404, error: "Sample not found." };
  return { ok: true, kind: "sample", client: found.client, sample: found.sample };
}

export function handoverProofOnTarget(
  loaded: LoadedHandoverProofTarget
): HandoverProofImage | null {
  if (loaded.kind === "work_order") return loaded.workOrder.handover_proof ?? null;
  return loaded.sample.handover_proof ?? null;
}

export async function attachWorkOrderHandoverProof(
  workOrderId: string,
  image: HandoverProofImage
): Promise<Result<{ work_order: ProductionWorkOrder }>> {
  await ensureDocumentsLoaded(["production_work_orders"]);
  const store = readProductionWorkOrders();
  const index = store.work_orders.findIndex((row) => row.id === workOrderId);
  if (index < 0) return { ok: false, status: 404, error: "Work order not found." };

  const previous = store.work_orders[index]!;
  const previousProof = previous.handover_proof ?? null;
  const next: ProductionWorkOrder = { ...previous, handover_proof: image };
  const workOrders = [...store.work_orders];
  workOrders[index] = next;
  await writeProductionWorkOrders({ ...store, work_orders: workOrders });

  if (previousProof && previousProof.stored_filename !== image.stored_filename) {
    try {
      await deleteHandoverProofImage(previousProof.stored_filename);
    } catch {
      /* best-effort */
    }
  }

  return { ok: true, work_order: next };
}

export async function attachHandoverProof(
  target: HandoverProofTarget,
  targetId: string,
  image: HandoverProofImage
): Promise<Result<{ image: HandoverProofImage }>> {
  if (target === "work_order") {
    const attached = await attachWorkOrderHandoverProof(targetId, image);
    if (!attached.ok) return attached;
    return { ok: true, image };
  }
  const attached = await attachReadyMadeSampleHandoverProof(targetId, image);
  if (!attached.ok) return attached;
  return { ok: true, image };
}
