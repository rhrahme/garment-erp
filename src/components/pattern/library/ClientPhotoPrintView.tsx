"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import type { ClientPhoto } from "@/lib/types/sales-workspace";

const PHOTO_PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
@media print {
  .no-print { display: none !important; }
  .photo-print-page {
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    break-after: page;
    page-break-after: always;
  }
  .photo-print-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .photo-print-img {
    max-height: 240mm !important;
    object-fit: contain !important;
  }
}
`;

function isVideo(photo: ClientPhoto): boolean {
  return (photo.content_type || "").startsWith("video/");
}

function photoLabel(photo: ClientPhoto): string {
  const parts = [
    photo.assigned_article_number || null,
    photo.assigned_so_number || null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : photo.filename;
}

export type ClientPhotoPrintViewProps = {
  patternId: string;
  patternRef: string;
  clientName: string | null;
  photos: ClientPhoto[];
};

/** A4-friendly print sheet for client wearing photos assigned to a pattern. */
export function ClientPhotoPrintView({
  patternId,
  patternRef,
  clientName,
  photos,
}: ClientPhotoPrintViewProps) {
  const printable = photos.filter((photo) => !isVideo(photo));
  const skippedVideos = photos.length - printable.length;

  return (
    <div className="mx-auto min-h-screen max-w-[210mm] bg-white p-6 text-slate-900 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: PHOTO_PRINT_CSS }} />

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <Link
            href={`/pattern/library/clients/${patternId}`}
            className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            Back to {patternRef}
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            A4 portrait - Client wearing photos
            {clientName ? ` - ${clientName}` : ""}
            {` - ${printable.length} image${printable.length === 1 ? "" : "s"}`}
            {skippedVideos > 0
              ? ` - ${skippedVideos} video${skippedVideos === 1 ? "" : "s"} skipped`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={printable.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      {printable.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          No printable images. Assign photos to this sheet first, or select images (videos are skipped).
        </div>
      ) : (
        <div className="space-y-8 print:space-y-0">
          {printable.map((photo, index) => {
            const mediaUrl = `/api/sales/client-photos/${encodeURIComponent(photo.id)}?v=${encodeURIComponent(photo.uploaded_at)}`;
            return (
              <article
                key={photo.id}
                className="photo-print-page rounded-xl border border-slate-200 p-5 shadow-sm print:shadow-none"
              >
                <header className="mb-3 flex items-start justify-between gap-3 border-b border-slate-300 pb-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Client wearing photo
                    </p>
                    <h1 className="mt-0.5 font-mono text-base font-bold">{patternRef}</h1>
                    {clientName ? (
                      <p className="mt-0.5 text-sm text-slate-700">{clientName}</p>
                    ) : null}
                    <p className="mt-1 text-sm font-medium text-slate-800">{photoLabel(photo)}</p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold text-slate-500">
                    {index + 1} / {printable.length}
                  </p>
                </header>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl}
                  alt={photo.filename}
                  className="photo-print-img mx-auto max-h-[70vh] w-full object-contain"
                />
                <p className="mt-2 truncate text-center text-[11px] text-slate-400">
                  {photo.filename}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
