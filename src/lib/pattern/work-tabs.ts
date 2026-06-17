import type { PatternJobStatus, PatternWorkTab } from "@/lib/types/pattern";

export function jobMatchesTab(status: PatternJobStatus, tab: PatternWorkTab): boolean {
  switch (tab) {
    case "new":
      return status === "pending" || status === "assigned";
    case "drafting":
      return status === "drafting";
    case "in_fittings":
      return status === "awaiting_fitting";
    case "revising":
      return status === "revising";
    case "ready_for_cutting":
      return status === "ready_for_cutting";
    case "blocked":
      return status === "blocked";
    case "completed":
      return status === "completed" || status === "cancelled";
    default:
      return false;
  }
}
