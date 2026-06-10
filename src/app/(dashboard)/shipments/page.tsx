import { Suspense } from "react";
import { ShipmentsWorkspace } from "@/components/shipments/ShipmentsWorkspace";

export default function ShipmentsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading AWB tracking…</p>}>
      <ShipmentsWorkspace />
    </Suspense>
  );
}
