"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrapersFabricSwatchProps {
  fabricNumber: string;
  src?: string;
  zoomSrc?: string;
  className?: string;
  loading?: "lazy" | "eager";
  /** When true, clicking does not open the enlarge lightbox (parent handles preview). */
  disableZoom?: boolean;
}

/** Neutral empty cell — no broken-image / ImageOff icon. */
function NoPhotoPlaceholder({
  fabricNumber,
  className,
}: {
  fabricNumber: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block h-7 w-7 shrink-0 rounded border border-slate-200 bg-slate-100",
        className
      )}
      title={`No photo for ${fabricNumber}`}
      aria-label={`No photo for fabric ${fabricNumber}`}
    />
  );
}

/** Small square thumbnail from Drapers / Caccioppoli / Loro Piana swatch URLs. */
export function DrapersFabricSwatch({
  fabricNumber,
  src,
  zoomSrc,
  className,
  loading = "lazy",
  disableZoom = false,
}: DrapersFabricSwatchProps) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const enlarged = zoomSrc ?? src;

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!src || failed) {
    return <NoPhotoPlaceholder fabricNumber={fabricNumber} className={className} />;
  }

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={28}
      height={28}
      loading={loading}
      // Keep eager/print thumbs visible even before onLoad (opacity-0 blanked SO prints).
      className={cn(
        "h-7 w-7 rounded object-cover print:opacity-100",
        loading !== "eager" && !loaded && "opacity-0"
      )}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );

  if (disableZoom) {
    return (
      <span
        className={cn("inline-block shrink-0 rounded border border-slate-200", className)}
        title={`Fabric ${fabricNumber}`}
      >
        {image}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        title={`Fabric ${fabricNumber} — enlarge swatch`}
        className={cn(
          "inline-block shrink-0 cursor-zoom-in rounded border border-slate-200",
          className
        )}
      >
        {image}
      </button>

      {open && enlarged ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={`Fabric ${fabricNumber} swatch`}
        >
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 rounded-full bg-white p-2 text-slate-800 shadow-lg hover:bg-slate-100"
            aria-label="Close swatch preview"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlarged}
            alt={`Fabric ${fabricNumber}`}
            className="max-h-[80vh] max-w-[min(90vw,520px)] rounded-lg bg-white object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            onError={() => {
              setFailed(true);
              close();
            }}
          />
          <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-sm text-slate-700 shadow">
            {fabricNumber} · click outside or press Esc to close
          </p>
        </div>
      ) : null}
    </>
  );
}
