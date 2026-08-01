import { Suspense } from "react";
import { StitchFloorWorkspace } from "@/components/production/StitchFloorWorkspace";

export default function StitchOrdersPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-1 sm:px-0">
      <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading orders...</div>}>
        <StitchFloorWorkspace initialTab="orders" />
      </Suspense>
    </div>
  );
}
