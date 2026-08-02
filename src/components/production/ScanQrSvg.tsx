"use client";

import { useMemo } from "react";
import qrcode from "@/lib/production/vendor/qrcode-generator.js";

/** ISO/IEC 18004 quiet zone so phone scanners can locate the code. */
const QUIET_MODULES = 4;

/**
 * Crisp inline SVG QR for floor dashboards. Renders the exact payload that was
 * scanned so supervisors can re-scan a garment straight off the screen.
 */
export default function ScanQrSvg({
  value,
  sizePx = 56,
  className,
}: {
  value: string;
  sizePx?: number;
  className?: string;
}) {
  const model = useMemo(() => {
    const payload = value.trim();
    if (!payload || payload === "-") return null;
    try {
      const qr = qrcode(0, "M");
      qr.addData(payload);
      qr.make();
      const count = qr.getModuleCount();
      let path = "";
      for (let r = 0; r < count; r += 1) {
        for (let c = 0; c < count; c += 1) {
          if (!qr.isDark(r, c)) continue;
          path += `M${c + QUIET_MODULES} ${r + QUIET_MODULES}h1v1h-1z`;
        }
      }
      return { path, edge: count + QUIET_MODULES * 2 };
    } catch {
      return null;
    }
  }, [value]);

  if (!model) return null;

  return (
    <svg
      viewBox={`0 0 ${model.edge} ${model.edge}`}
      width={sizePx}
      height={sizePx}
      role="img"
      aria-label={`QR ${value}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={model.edge} height={model.edge} fill="#ffffff" />
      <path d={model.path} fill="#000000" />
    </svg>
  );
}
