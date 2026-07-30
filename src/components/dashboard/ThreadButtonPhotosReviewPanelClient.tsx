"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/PageHeader";
import type { ThreadButtonMatchRecord, ThreadButtonPhoto } from "@/lib/types/thread-button-matching";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type ThreadButtonPhotoReviewItem = ThreadButtonPhoto & {
  match_id: string;
  sales_order_id: string;
  sales_order_line_id: string;
  so_number: string;
  client_name: string;
  client_code: string;
  fabric_number: string;
  article_number: number;
  garment_type: string;
  fabric_cut_code: string | null;
};

type ThreadButtonPhotosReviewPanelClientProps = {
  initialItems: ThreadButtonPhotoReviewItem[];
};

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

export function ThreadButtonPhotosReviewPanelClient({
  initialItems,
}: ThreadButtonPhotosReviewPanelClientProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingCount = items.filter((item) => !item.admin_acknowledged_at).length;

  async function acknowledge(photoId: string) {
    setActingId(photoId);
    setError(null);
    try {
      const res = await fetch(`/api/thread-button-matching/photos/${encodeURIComponent(photoId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge" }),
      });
      const data = (await res.json()) as { error?: string; photo?: ThreadButtonPhoto };
      if (!res.ok) throw new Error(data.error ?? "Failed to acknowledge");
      setItems((current) =>
        current.map((item) =>
          item.id === photoId && data.photo
            ? {
                ...item,
                admin_acknowledged_at: data.photo.admin_acknowledged_at,
                admin_acknowledged_by: data.photo.admin_acknowledged_by,
              }
            : item
        )
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge");
    } finally {
      setActingId(null);
    }
  }

  async function acknowledgeAll() {
    const pending = items.filter((item) => !item.admin_acknowledged_at);
    for (const item of pending) {
      await acknowledge(item.id);
    }
  }

  if (items.length === 0) return null;

  return (
    <div id="thread-button-photos">
    <Card
      className={cn(
        "mb-8",
        pendingCount > 0 && "border-amber-400 bg-amber-50/40 shadow-sm ring-1 ring-amber-200"
      )}
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Camera className="h-5 w-5 text-amber-600" />
              Thread &amp; buttons photos
              {pendingCount > 0 ? (
                <Badge className="border border-amber-300 bg-amber-100 text-amber-900">
                  {pendingCount} need review
                </Badge>
              ) : (
                <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-800">
                  <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
                  All reviewed
                </Badge>
              )}
            </CardTitle>
            {pendingCount > 0 ? (
              <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Operators uploaded thread/button photos ù open Thread &amp; buttons to view, then
                acknowledge here.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/thread-buttons">
              <Button variant="secondary" size="sm">
                Open Thread &amp; buttons
              </Button>
            </Link>
            {pendingCount > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={actingId !== null}
                onClick={() => void acknowledgeAll()}
              >
                Acknowledge all
              </Button>
            ) : null}
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          columns={[
            { key: "when", label: "When" },
            { key: "order", label: "Order" },
            { key: "fabric", label: "Fabric" },
            { key: "file", label: "File" },
            { key: "by", label: "By" },
            { key: "status", label: "Status" },
          ]}
          rows={items.map((item) => ({
            when: formatDateTime(item.uploaded_at),
            order: (
              <span>
                {item.so_number} ù {formatArticle(item.article_number)}
                <span className="mt-0.5 block text-xs text-slate-500">
                  {item.client_name} ({item.client_code})
                </span>
              </span>
            ),
            fabric: (
              <span>
                {item.fabric_number}
                <span className="mt-0.5 block text-xs text-slate-500">{item.garment_type}</span>
              </span>
            ),
            file: item.filename,
            by: item.uploaded_by ?? "ù",
            status: item.admin_acknowledged_at ? (
              <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-800">
                Reviewed
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={actingId !== null}
                onClick={() => void acknowledge(item.id)}
              >
                Acknowledge
              </Button>
            ),
          }))}
        />
      </CardContent>
    </Card>
    </div>
  );
}

export function toThreadButtonPhotoReviewItems(
  rows: Array<{ match: ThreadButtonMatchRecord; photo: ThreadButtonPhoto }>
): ThreadButtonPhotoReviewItem[] {
  return rows.map(({ match, photo }) => ({
    ...photo,
    match_id: match.id,
    sales_order_id: match.sales_order_id,
    sales_order_line_id: match.sales_order_line_id,
    so_number: match.so_number,
    client_name: match.client_name,
    client_code: match.client_code,
    fabric_number: match.fabric_number,
    article_number: match.article_number,
    garment_type: match.garment_type,
    fabric_cut_code: match.fabric_cut_code,
  }));
}
