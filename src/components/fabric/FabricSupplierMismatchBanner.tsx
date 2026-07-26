"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useFabricSupplierMismatch } from "@/hooks/useFabricSupplierMismatch";

export function FabricSupplierMismatchBanner({
  supplierId,
  supplierName,
  fabricNumber,
  onSwitchSupplier,
}: {
  supplierId: string;
  supplierName: string;
  fabricNumber: string;
  onSwitchSupplier: (next: { supplier_id: string; supplier_name: string }) => void;
}) {
  const { hint } = useFabricSupplierMismatch(supplierId, fabricNumber);

  if (!hint) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p>
            This fabric number looks like <span className="font-semibold">{hint.suggested_supplier_name}</span>, not{" "}
            {supplierName || hint.selected_supplier_name} — switch supplier?
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2 h-8 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
            onClick={() =>
              onSwitchSupplier({
                supplier_id: hint.suggested_supplier_id,
                supplier_name: hint.suggested_supplier_name,
              })
            }
          >
            Switch to {hint.suggested_supplier_name}
          </Button>
        </div>
      </div>
    </div>
  );
}
