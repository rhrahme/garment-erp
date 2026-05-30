import type { PurchaseOrder, SupplierFabric } from "@/lib/types/fabric-sourcing";
import { getFactoryOrdersEmail } from "@/lib/data/supplier-catalogs";
import {
  buildFabricOrderEmail,
  fabricSpecsSummary,
  parsePriceListRow,
  purchaseOrderToEmail as purchaseOrderToEmailBase,
  resolveSupplierEmails,
  supplierToOrderEmail,
  PRICE_LIST_IMPORT_COLUMNS,
  type PriceListImportRow,
} from "@/lib/fabric-sourcing/email-content";

export {
  buildFabricOrderEmail,
  fabricSpecsSummary,
  parsePriceListRow,
  resolveSupplierEmails,
  supplierToOrderEmail,
  PRICE_LIST_IMPORT_COLUMNS,
  type PriceListImportRow,
};

export function purchaseOrderToEmail(
  po: PurchaseOrder,
  fabrics: SupplierFabric[],
  options?: { clientCode?: string; deliveryDestination?: import("@/lib/shipping/delivery-destinations").DeliveryDestination | null }
) {
  return purchaseOrderToEmailBase(po, fabrics, {
    ...options,
    fromEmail: getFactoryOrdersEmail(),
  });
}
