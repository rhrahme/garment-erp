import { formatFabricSupplierName, isSolbiatiFabric } from "@/lib/fabric-sourcing/supplier-display";
import { cn } from "@/lib/utils";

type FabricSupplierNameProps = {
  supplierId: string;
  supplierName: string;
  fabricNumber: string;
  className?: string;
  showBadge?: boolean;
};

export function FabricSupplierName({
  supplierId,
  supplierName,
  fabricNumber,
  className,
  showBadge = false,
}: FabricSupplierNameProps) {
  const name = formatFabricSupplierName(supplierId, supplierName, fabricNumber);
  const solbiati = isSolbiatiFabric(supplierId, fabricNumber);

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span>{name}</span>
      {showBadge && solbiati && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
          Linen
        </span>
      )}
    </span>
  );
}
