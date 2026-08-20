export function defaultConsolidateMode(hasExistingForGarment: boolean): "new" | "existing" {
  return hasExistingForGarment ? "existing" : "new";
}

export const ADD_TO_EXISTING_CONSOLIDATION_BOARD_HINT_TITLE =
  "More fabrics on the same pattern";

export const ADD_TO_EXISTING_CONSOLIDATION_BOARD_HINT_BODY =
  "Tick only the extra fabrics, then Consolidate selected. This is not a new pattern.";

export const ADD_TO_EXISTING_CONSOLIDATION_MODAL_HINT =
  "These fabrics go on the pattern you already made. Not a new pattern.";
