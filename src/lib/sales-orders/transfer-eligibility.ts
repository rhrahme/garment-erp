import { fabricLineHighlightLabel } from "@/lib/production/scan-stage-highlight";
import type { FabricReceipt, FabricLineReceiveStatus } from "@/lib/types/fabric-receipts";
import type { FabricPrepStep, ProductionStage, ProductionWorkOrder } from "@/lib/types/production";

export type TransferEligibilityCode =
  | "ok"
  | "receiving_pipeline"
  | "handed_off"
  | "active_production"
  | "cutting_override";

export type TransferEligibility = {
  code: TransferEligibilityCode;
  /** True when transfer may proceed without special flags. */
  allowed: boolean;
  /** Mid receiving / wash-iron — allow after explicit acknowledge. */
  requires_receiving_ack: boolean;
  /** Handed off with cutting-only WOs — Admin may override. */
  admin_override_available: boolean;
  /** Hard block (or override not taken). */
  blocked: boolean;
  stage_label: string;
  client_name: string;
  receipt_status: FabricLineReceiveStatus | null;
  fabric_prep_step: FabricPrepStep | null;
  active_work_order_count: number;
  active_work_order_stages: ProductionStage[];
  message: string;
  remediation: string | null;
};

/** Stages still safe to cancel with Admin override (before sewing). */
const OVERRIDE_SAFE_STAGES = new Set<ProductionStage>(["received", "fabric_prep", "cutting"]);

function activeWorkOrders(workOrders: ProductionWorkOrder[]): ProductionWorkOrder[] {
  return workOrders.filter((wo) => wo.status !== "completed");
}

export function describeFabricTransferStage(
  receipt: FabricReceipt | null | undefined
): { stage_label: string; receipt_status: FabricLineReceiveStatus | null; fabric_prep_step: FabricPrepStep | null } {
  if (!receipt) {
    return {
      stage_label: "Not yet received (on order / awaiting receive)",
      receipt_status: null,
      fabric_prep_step: null,
    };
  }
  if (receipt.status === "handed_off") {
    return {
      stage_label: "Handed off to production / workshop",
      receipt_status: receipt.status,
      fabric_prep_step: null,
    };
  }
  return {
    stage_label: fabricLineHighlightLabel(receipt.status, receipt.fabric_prep_step),
    receipt_status: receipt.status,
    fabric_prep_step: receipt.fabric_prep_step ?? null,
  };
}

/**
 * Decide warn / block / admin-override for transferring a fabric line.
 * Pure — pass receipt (active or archived) and WOs for the line.
 */
export function assessFabricTransferEligibility(input: {
  client_name: string;
  receipt: FabricReceipt | null | undefined;
  work_orders: ProductionWorkOrder[];
}): TransferEligibility {
  const clientName = input.client_name.trim() || "this client";
  const stage = describeFabricTransferStage(input.receipt);
  const active = activeWorkOrders(input.work_orders);
  const stages = [...new Set(active.map((wo) => wo.status))];
  const progressedPastCutting = active.some((wo) => !OVERRIDE_SAFE_STAGES.has(wo.status));
  const allOverrideSafe =
    active.length > 0 && active.every((wo) => OVERRIDE_SAFE_STAGES.has(wo.status));

  const base = {
    stage_label: stage.stage_label,
    client_name: clientName,
    receipt_status: stage.receipt_status,
    fabric_prep_step: stage.fabric_prep_step,
    active_work_order_count: active.length,
    active_work_order_stages: stages,
  };

  // Unsafe: workshop has progressed past cutting — would orphan / double-count scans.
  if (progressedPastCutting) {
    const stageList = stages.join(", ");
    return {
      ...base,
      code: "active_production",
      allowed: false,
      requires_receiving_ack: false,
      admin_override_available: false,
      blocked: true,
      message: `Cannot transfer — fabric for ${clientName} is already in production (${stageList || "active work orders"}). Transfer would orphan workshop scans and sticker codes.`,
      remediation:
        "Finish or archive the production work orders for this line first. If handoff was a mistake before cutting started, use Fabric Receiving testing reset (Admin) then transfer.",
    };
  }

  // Handed off / cutting queue: Admin may cancel cutting WOs and transfer (full line only at call site).
  if (active.length > 0 && allOverrideSafe) {
    return {
      ...base,
      code: "cutting_override",
      allowed: false,
      requires_receiving_ack: false,
      admin_override_available: true,
      blocked: true,
      message: `Blocked — fabric for ${clientName} was handed to the workshop and has ${active.length} cutting work order(s). Transfer would leave those jobs pointing at the old stickers/client.`,
      remediation:
        "Admin can override: this cancels the cutting work orders, moves the fabric to the destination SO (new stickers), and destination must hand off to cutting again. Partial meters are not allowed with override. Prefer finishing cutting on the original client if work already started on the floor.",
    };
  }

  if (input.receipt?.status === "handed_off") {
    return {
      ...base,
      code: "handed_off",
      allowed: false,
      requires_receiving_ack: false,
      admin_override_available: true,
      blocked: true,
      message: `Blocked — fabric for ${clientName} has already been handed off to production. Transfer would desync receiving and workshop ownership.`,
      remediation:
        "Admin can override if cutting has not started (no active sewing+ work). Otherwise complete production on the original client, or reset the mistaken handoff before transferring.",
    };
  }

  // Mid receiving pipeline — allow with confirm (emergency transfers after wash/iron are common).
  if (input.receipt && (input.receipt.status === "received" || input.receipt.status === "fabric_prep")) {
    const prepHint =
      input.receipt.status === "fabric_prep" && input.receipt.fabric_prep_step
        ? ` (${stage.stage_label})`
        : input.receipt.status === "received"
          ? " (received, not yet prepped)"
          : "";
    return {
      ...base,
      code: "receiving_pipeline",
      allowed: true,
      requires_receiving_ack: true,
      admin_override_available: false,
      blocked: false,
      message: `Warning — this fabric for ${clientName} is mid receiving${prepHint}. Prep work (wash / soak / dry / iron) travels with the meters you transfer. Confirm this is intentional.`,
      remediation: null,
    };
  }

  return {
    ...base,
    code: "ok",
    allowed: true,
    requires_receiving_ack: false,
    admin_override_available: false,
    blocked: false,
    message: "Ready to transfer.",
    remediation: null,
  };
}
