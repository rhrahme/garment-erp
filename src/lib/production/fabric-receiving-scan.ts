import type { FabricReceipt } from "@/lib/types/fabric-receipts";
import type { ScanStation } from "@/lib/production/stage-scan";

/** Fabric receiving stations — operator picks the path by which button is selected. */
export const FABRIC_RECEIVING_STATIONS = ["receive", "wash", "soak", "iron"] as const satisfies readonly ScanStation[];

export function isFabricReceivingStation(station: ScanStation): station is (typeof FABRIC_RECEIVING_STATIONS)[number] {
  return (FABRIC_RECEIVING_STATIONS as readonly string[]).includes(station);
}

export function fabricReceivingStationError(
  receipt: FabricReceipt | undefined,
  station: ScanStation
): string | null {
  if (!receipt || receipt.status !== "fabric_prep" || !receipt.fabric_prep_step) return null;

  const step = receipt.fabric_prep_step;
  if (station === "wash" && step === "soak") {
    return "This fabric is soaking — scan at the Soak station.";
  }
  if (station === "wash" && step === "iron") {
    return "Washing is done — scan at Iron.";
  }
  if (station === "soak" && step === "wash") {
    return "This fabric is in wash — scan at Wash.";
  }
  if (station === "soak" && step === "iron") {
    return "Soaking is done — scan at Iron.";
  }
  if (station === "iron" && step !== "iron") {
    const where = step === "wash" ? "Wash" : "Soak";
    return `Finish ${where.toLowerCase()} first — scan at ${where}.`;
  }
  return null;
}
