import type { FabricLineReceiveStatus } from "@/lib/types/fabric-receipts";
import type { FabricPrepStep } from "@/lib/types/production";
import type { ProductionStage } from "@/lib/types/production";

/** ERP-only row highlights after station scans (not used on print). */
export type ScanHighlightStage =
  | "pending"
  | "received"
  | "fabric_wash"
  | "fabric_soak"
  | "fabric_dry"
  | "fabric_iron"
  | "in_production"
  | "cutting"
  | "sewing"
  | "garment_wash"
  | "finishing"
  | "packed"
  | "completed";

export const SCAN_STAGE_LEGEND: Array<{ stage: ScanHighlightStage; label: string }> = [
  { stage: "received", label: "Fabric received (pink — scan at Receive)" },
  { stage: "fabric_wash", label: "Machine wash (sky blue — scan at Wash)" },
  { stage: "fabric_soak", label: "Soak (teal — scan at Soak)" },
  { stage: "fabric_dry", label: "Drying (grey — hung to dry, scan at Iron)" },
  { stage: "fabric_iron", label: "Iron (amber — scan at Iron)" },
  { stage: "cutting", label: "Cutting" },
  { stage: "sewing", label: "Sewing" },
  { stage: "garment_wash", label: "Garment wash" },
  { stage: "finishing", label: "Finishing" },
  { stage: "packed", label: "Packed" },
];

const STYLES: Record<
  ScanHighlightStage,
  { row: string; chip: string; label: string }
> = {
  pending: {
    row: "bg-white",
    chip: "bg-slate-100 text-slate-600",
    label: "Awaiting fabric",
  },
  received: {
    row: "bg-pink-50 ring-1 ring-inset ring-pink-200/80",
    chip: "bg-pink-100 text-pink-900",
    label: "Fabric received",
  },
  fabric_wash: {
    row: "bg-sky-50 ring-1 ring-inset ring-sky-200/80",
    chip: "bg-sky-100 text-sky-900",
    label: "Machine wash",
  },
  fabric_soak: {
    row: "bg-teal-50 ring-1 ring-inset ring-teal-200/80",
    chip: "bg-teal-100 text-teal-900",
    label: "Soak",
  },
  fabric_dry: {
    row: "bg-slate-100 ring-1 ring-inset ring-indigo-200/70",
    chip: "bg-slate-200 text-slate-700",
    label: "Drying",
  },
  fabric_iron: {
    row: "bg-amber-50 ring-1 ring-inset ring-amber-200/80",
    chip: "bg-amber-100 text-amber-950",
    label: "Iron",
  },
  in_production: {
    row: "bg-violet-50/80 ring-1 ring-inset ring-violet-200/70",
    chip: "bg-violet-100 text-violet-900",
    label: "With production",
  },
  cutting: {
    row: "bg-orange-50 ring-1 ring-inset ring-orange-200/80",
    chip: "bg-orange-100 text-orange-950",
    label: "Cutting",
  },
  sewing: {
    row: "bg-emerald-50 ring-1 ring-inset ring-emerald-200/80",
    chip: "bg-emerald-100 text-emerald-900",
    label: "Sewing",
  },
  garment_wash: {
    row: "bg-cyan-50 ring-1 ring-inset ring-cyan-200/80",
    chip: "bg-cyan-100 text-cyan-900",
    label: "Garment wash",
  },
  finishing: {
    row: "bg-indigo-50 ring-1 ring-inset ring-indigo-200/70",
    chip: "bg-indigo-100 text-indigo-900",
    label: "Finishing",
  },
  packed: {
    row: "bg-slate-100 ring-1 ring-inset ring-slate-300/80",
    chip: "bg-slate-200 text-slate-800",
    label: "Packed",
  },
  completed: {
    row: "bg-green-50/60 ring-1 ring-inset ring-green-200/60",
    chip: "bg-green-100 text-green-900",
    label: "Completed",
  },
};

export function scanStageStyles(stage: ScanHighlightStage) {
  return STYLES[stage];
}

export function scanHighlightForFabricStation(station: "receive" | "wash" | "soak" | "iron"): ScanHighlightStage {
  switch (station) {
    case "receive":
      return "received";
    case "wash":
      return "fabric_wash";
    case "soak":
      return "fabric_soak";
    case "iron":
      return "fabric_iron";
  }
}

export function productionStageToHighlight(stage: ProductionStage): ScanHighlightStage {
  switch (stage) {
    case "received":
      return "received";
    case "fabric_prep":
      return "in_production";
    case "cutting":
      return "cutting";
    case "sewing":
      return "sewing";
    case "washing":
      return "garment_wash";
    case "finishing":
      return "finishing";
    case "packed":
      return "packed";
    case "completed":
      return "completed";
    default:
      return "in_production";
  }
}

export function fabricLineToHighlightStage(
  lineStatus: FabricLineReceiveStatus,
  prepStep: FabricPrepStep | null | undefined
): ScanHighlightStage {
  if (lineStatus === "pending") return "pending";
  if (lineStatus === "received") return "received";
  if (lineStatus === "fabric_prep") {
    if (prepStep === "wash") return "fabric_wash";
    if (prepStep === "soak") return "fabric_soak";
    if (prepStep === "drying") return "fabric_dry";
    if (prepStep === "iron") return "fabric_iron";
    return "fabric_iron";
  }
  return "in_production";
}

export function fabricLineHighlightLabel(
  lineStatus: FabricLineReceiveStatus,
  prepStep: FabricPrepStep | null | undefined
): string {
  if (lineStatus === "fabric_prep" && prepStep) {
    const step =
      prepStep === "wash"
        ? "Washing"
        : prepStep === "soak"
          ? "Soaking"
          : prepStep === "drying"
            ? "Drying"
            : "Ironing";
    return `${scanStageStyles(fabricLineToHighlightStage(lineStatus, prepStep)).label} — ${step}`;
  }
  return scanStageStyles(fabricLineToHighlightStage(lineStatus, prepStep)).label;
}
