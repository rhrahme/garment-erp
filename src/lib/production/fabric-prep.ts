export const FABRIC_PREP_TYPES = [
  { id: "wash_iron", label: "Wash + iron" },
  { id: "soak_iron", label: "Soak + iron" },
  { id: "iron_only", label: "Iron only" },
] as const;

export type FabricPrepType = (typeof FABRIC_PREP_TYPES)[number]["id"];
export type FabricPrepStep = "wash" | "soak" | "drying" | "iron";

export function isFabricPrepType(value: string): value is FabricPrepType {
  return FABRIC_PREP_TYPES.some((type) => type.id === value);
}

export function firstFabricPrepStep(type: FabricPrepType): FabricPrepStep {
  switch (type) {
    case "wash_iron":
      return "wash";
    case "soak_iron":
      return "soak";
    case "iron_only":
      return "iron";
  }
}

export function nextFabricPrepStep(type: FabricPrepType, current: FabricPrepStep): FabricPrepStep | null {
  if (type === "wash_iron") {
    if (current === "wash") return "drying";
    if (current === "drying") return "iron";
    return null;
  }
  if (type === "soak_iron") {
    if (current === "soak") return "drying";
    if (current === "drying") return "iron";
    return null;
  }
  return null;
}

export function fabricPrepTypeLabel(type: FabricPrepType): string {
  return FABRIC_PREP_TYPES.find((item) => item.id === type)?.label ?? type;
}

export function fabricPrepStepLabel(step: FabricPrepStep): string {
  switch (step) {
    case "wash":
      return "Washing";
    case "soak":
      return "Soaking";
    case "drying":
      return "Drying";
    case "iron":
      return "Ironing";
  }
}

export function fabricPrepStatusLabel(type: FabricPrepType, step: FabricPrepStep): string {
  return `${fabricPrepTypeLabel(type)} — ${fabricPrepStepLabel(step)}`;
}

export function completeFabricPrepActionLabel(type: FabricPrepType, step: FabricPrepStep): string | null {
  switch (step) {
    case "wash":
      return "Finish wash → hang to dry";
    case "soak":
      return "Finish soak → hang to dry";
    case "drying":
      return "Dry done → start ironing";
    case "iron":
      return "Finish ironing → ready for cutting";
  }
}
