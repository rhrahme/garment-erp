import Link from "next/link";
import { Factory, Layers, Package, Store } from "lucide-react";
import { PageHeader, StatCard, DataTable } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { formatStageSummary, getReadyMadeOverview } from "@/lib/ready-made/summary";

export default function ReadyMadePage() {
  const overview = getReadyMadeOverview();

  return (
    <div>
      <PageHeader
        title="Ready-Made"
        description="Retail brand production — tracked by garment article, not as person clients."
      />

      <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 text-sm text-violet-950">
        <p className="font-medium">How this works</p>
        <p className="mt-1 text-violet-900">
          Each row is one garment article (e.g. Linen Short, Regular Shirt). FR and GL factory batches for the same
          brand + article are consolidated into a single production order.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Retail brands"
          value={overview.brandCount}
          subtext="Massimo Dutti · Suit Supply · Boggi · Cafe Cotton · Zegna · Blue Mint · Lebanon Beirut · Luca Faloni"
          icon={<Store className="h-5 w-5" />}
          accent="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Articles"
          value={overview.articleCount}
          subtext={`${overview.orderCount} production orders`}
          icon={<Layers className="h-5 w-5" />}
          accent="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="Pieces in pipeline"
          value={overview.activePieces}
          subtext={`${overview.pieceCount} total pieces`}
          icon={<Factory className="h-5 w-5" />}
          accent="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Completed"
          value={overview.completedPieces}
          subtext="Marked done on production floor"
          icon={<Package className="h-5 w-5" />}
          accent="bg-emerald-50 text-emerald-600"
        />
      </div>

      <div className="space-y-8">
        {overview.brands.map((brand) => (
          <section key={brand.id} className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-slate-900">{brand.label}</h2>
                  <Badge className="bg-violet-100 text-violet-800">{brand.code}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {brand.articleCount} article{brand.articleCount !== 1 ? "s" : ""} · {brand.pieceCount} pieces ·{" "}
                  {brand.activePieces} active
                </p>
              </div>
            </div>

            {brand.articles.length === 0 ? (
              <p className="text-sm text-slate-400">No production imported for this brand yet.</p>
            ) : (
              <DataTable
                emptyMessage="No articles"
                columns={[
                  { key: "article", label: "Article" },
                  { key: "garments", label: "Garment types" },
                  { key: "fabrics", label: "Fabrics" },
                  { key: "pieces", label: "Pieces" },
                  { key: "pipeline", label: "Pipeline" },
                  { key: "order", label: "" },
                ]}
                rows={brand.articles.map((article) => ({
                  article: <span className="font-medium text-slate-900">{article.productArticle}</span>,
                  garments: (
                    <span className="text-slate-600">{article.garmentTypes.join(", ") || "—"}</span>
                  ),
                  fabrics: `${article.fabricLineCount} line${article.fabricLineCount !== 1 ? "s" : ""}`,
                  pieces: (
                    <div>
                      <p className="font-medium text-slate-900">{article.pieceCount}</p>
                      <p className="text-xs text-slate-400">
                        {article.activePieces} active · {article.completedPieces} done
                      </p>
                    </div>
                  ),
                  pipeline: (
                    <span className="text-xs text-slate-600">
                      {formatStageSummary(article.stageCounts) || "—"}
                    </span>
                  ),
                  order: (
                    <Link
                      href={`/orders/${article.orderId}`}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      {article.soNumber} →
                    </Link>
                  ),
                }))}
              />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
