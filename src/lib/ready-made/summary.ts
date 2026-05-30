import { READY_MADE_BRANDS } from "@/lib/integrations/clickup/ready-made-brands";
import { readProductionWorkOrders } from "@/lib/data/production-work-orders";
import { readSalesOrders } from "@/lib/data/sales-orders";
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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function getReadyMadeOverview(): ReadyMadeOverview {
  const orders = readSalesOrders().orders.filter((order) => order.retail_brand);
  const workOrders = readProductionWorkOrders().work_orders;
  const workByOrderId = new Map<string, typeof workOrders>();

  for (const workOrder of workOrders) {
    const bucket = workByOrderId.get(workOrder.sales_order_id) ?? [];
    bucket.push(workOrder);
    workByOrderId.set(workOrder.sales_order_id, bucket);
  }

  const brands: ReadyMadeBrandSummary[] = READY_MADE_BRANDS.map((brand) => {
    const brandOrders = orders.filter((order) => order.retail_brand === brand.label);
    const articles: ReadyMadeArticleRow[] = brandOrders
      .map((order) => {
        const orderWork = workByOrderId.get(order.id) ?? [];
        const stageCounts: Partial<Record<ProductionStage, number>> = {};
        let activePieces = 0;
        let completedPieces = 0;

        for (const workOrder of orderWork) {
          stageCounts[workOrder.status] = (stageCounts[workOrder.status] ?? 0) + 1;
          if (workOrder.status === "completed") completedPieces += 1;
          else activePieces += 1;
        }

        return {
          productArticle: order.product_article ?? "General",
          orderId: order.id,
          soNumber: order.so_number,
          garmentTypes: uniqueSorted(order.fabric_lines.map((line) => line.garment_type)),
          fabricLineCount: order.fabric_lines.length,
          pieceCount: orderWork.length,
          activePieces,
          completedPieces,
          stageCounts,
        };
      })
      .sort((a, b) => a.productArticle.localeCompare(b.productArticle));

    const pieceCount = articles.reduce((sum, row) => sum + row.pieceCount, 0);
    const activePieces = articles.reduce((sum, row) => sum + row.activePieces, 0);
    const completedPieces = articles.reduce((sum, row) => sum + row.completedPieces, 0);

    return {
      id: brand.id,
      label: brand.label,
      code: brand.client_code,
      articleCount: articles.length,
      orderCount: brandOrders.length,
      pieceCount,
      activePieces,
      completedPieces,
      articles,
    };
  });

  const articleCount = brands.reduce((sum, brand) => sum + brand.articleCount, 0);
  const orderCount = brands.reduce((sum, brand) => sum + brand.orderCount, 0);
  const pieceCount = brands.reduce((sum, brand) => sum + brand.pieceCount, 0);
  const activePieces = brands.reduce((sum, brand) => sum + brand.activePieces, 0);
  const completedPieces = brands.reduce((sum, brand) => sum + brand.completedPieces, 0);

  return {
    brandCount: READY_MADE_BRANDS.length,
    articleCount,
    orderCount,
    pieceCount,
    activePieces,
    completedPieces,
    brands,
  };
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
    .join(" · ");
}
