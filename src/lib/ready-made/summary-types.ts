import type { ProductionStage } from "@/lib/types/production";

export interface ReadyMadeArticleRow {
  productArticle: string;
  orderId: string;
  soNumber: string;
  garmentTypes: string[];
  fabricLineCount: number;
  pieceCount: number;
  activePieces: number;
  completedPieces: number;
  stageCounts: Partial<Record<ProductionStage, number>>;
}

export interface ReadyMadeBrandSummary {
  id: string;
  label: string;
  code: string;
  articleCount: number;
  orderCount: number;
  pieceCount: number;
  activePieces: number;
  completedPieces: number;
  articles: ReadyMadeArticleRow[];
}

export interface ReadyMadeOverview {
  brandCount: number;
  articleCount: number;
  orderCount: number;
  pieceCount: number;
  activePieces: number;
  completedPieces: number;
  brands: ReadyMadeBrandSummary[];
}

export function formatStageSummary(stageCounts: Partial<Record<ProductionStage, number>>): string {
  const labels: Record<ProductionStage, string> = {
    received: "Received",
    fabric_prep: "Fabric prep",
    cutting: "Cutting",
    sewing: "Sewing",
    washing: "Wash",
    finishing: "Finishing",
    packed: "Packed",
    completed: "Done",
  };

  return Object.entries(stageCounts)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stage, count]) => `${labels[stage as ProductionStage] ?? stage}: ${count}`)
    .join(" / ");
}
