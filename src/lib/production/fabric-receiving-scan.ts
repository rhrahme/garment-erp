import type { FabricReceipt } from "@/lib/types/fabric-receipts";
import type { FabricPrepStep, FabricPrepType } from "@/lib/types/production";
import type { ScanStation } from "@/lib/production/stage-scan";

/** Fabric receiving stations — operator picks the path by which button is selected. */
export const FABRIC_RECEIVING_STATIONS = ["receive", "wash", "soak", "iron"] as const satisfies readonly ScanStation[];

export function isFabricReceivingStation(station: ScanStation): station is (typeof FABRIC_RECEIVING_STATIONS)[number] {
  return (FABRIC_RECEIVING_STATIONS as readonly string[]).includes(station);
}

/**
 * When Receive is scanned again after prep already started, tell the operator the real next step
 * instead of a vague "already received" (which feels like "nothing happened").
 */
export function fabricReceiveRescanHint(receipt: FabricReceipt | undefined): string | null {
  if (!receipt) return null;
  if (receipt.status === "fabric_prep" && receipt.fabric_prep_step === "wash") {
    return "Already in wash — select Wash and scan again to hang to dry";
  }
  if (receipt.status === "fabric_prep" && receipt.fabric_prep_step === "soak") {
    return "Already soaking — select Soak and scan again to hang to dry";
  }
  if (receipt.status === "fabric_prep" && receipt.fabric_prep_step === "drying") {
    return "Hung to dry — select Iron and scan to start ironing";
  }
  if (receipt.status === "fabric_prep" && receipt.fabric_prep_step === "iron") {
    return "Ironing — select Iron and scan to finish prep → cutting";
  }
  if (receipt.status === "handed_off") {
    return "Prep already done — this cut is with production";
  }
  return null;
}

export function fabricReceivingStationError(
  receipt: FabricReceipt | undefined,
  station: ScanStation
): string | null {
  if (!receipt || receipt.status !== "fabric_prep" || !receipt.fabric_prep_step) return null;

  const step = receipt.fabric_prep_step;
  if (station === "wash" && step !== "wash") {
    if (step === "soak") return "This fabric is soaking — scan at the Soak station.";
    if (step === "drying") return "Washing is done — it's drying. Scan at Iron to start ironing.";
    return "Washing is done — scan at Iron.";
  }
  if (station === "soak" && step !== "soak") {
    if (step === "wash") return "This fabric is in wash — scan at Wash.";
    if (step === "drying") return "Soaking is done — it's drying. Scan at Iron to start ironing.";
    return "Soaking is done — scan at Iron.";
  }
  // Iron station handles both the "start ironing" (drying) and "finish" (iron) scans.
  if (station === "iron" && step !== "iron" && step !== "drying") {
    const where = step === "wash" ? "Wash" : "Soak";
    return `Finish ${where.toLowerCase()} and hang to dry first — scan at ${where}.`;
  }
  return null;
}

export type FabricPrepStation = "wash" | "soak" | "iron";

export type FabricStationScanPlan =
  | { kind: "start_prep"; prep_type: FabricPrepType }
  | { kind: "advance"; from: FabricPrepStep }
  | { kind: "reject"; message: string };

const STATION_START_PREP_TYPE: Record<FabricPrepStation, FabricPrepType> = {
  wash: "wash_iron",
  soak: "soak_iron",
  iron: "iron_only",
};

/**
 * Pure state machine for a Wash/Soak/Iron scan against the receipt's CURRENT state.
 * The caller (stage-scan) executes the plan and words the confirmation messages.
 * Reject messages always describe the actual state — a received fabric is never
 * reported as "not received"; call sites must pass a receipt looked up fresh.
 */
export function planFabricStationScan(
  receipt: FabricReceipt | undefined,
  station: FabricPrepStation
): FabricStationScanPlan {
  if (!receipt) {
    return {
      kind: "reject",
      message: "Fabric not received yet — scan at Receive station first.",
    };
  }
  if (receipt.status === "handed_off") {
    return {
      kind: "reject",
      message: "Fabric prep is complete — this cut is on Production now.",
    };
  }

  const stationError = fabricReceivingStationError(receipt, station);
  if (stationError) {
    return { kind: "reject", message: stationError };
  }

  if (receipt.status === "received") {
    // First scan at any prep station starts that path — Iron starts iron-only,
    // matching the one-tap "Iron only" button.
    return { kind: "start_prep", prep_type: STATION_START_PREP_TYPE[station] };
  }

  if (receipt.status === "fabric_prep" && receipt.fabric_prep_step) {
    // stationError above guarantees the step belongs to this station
    // (wash→wash, soak→soak, iron→drying|iron).
    return { kind: "advance", from: receipt.fabric_prep_step };
  }

  return {
    kind: "reject",
    message: `Fabric is at ${receipt.status} with no prep step — use the work list buttons.`,
  };
}
