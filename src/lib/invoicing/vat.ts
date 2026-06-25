import { isRiyadhFabricDelivery } from "@/lib/invoicing/bank-details";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";

/** Saudi standard VAT rate — applied to invoice subtotal (excl. VAT). */
export const SAUDI_VAT_RATE = 0.15;

/** Saudi invoices are identified by fabric receive destination RUH (Riyadh). */
export function isSaudiInvoiceDelivery(destination: DeliveryDestination | null | undefined): boolean {
  return isRiyadhFabricDelivery(destination);
}

export function resolveInvoiceVatRate(destination: DeliveryDestination | null | undefined): number | null {
  return isSaudiInvoiceDelivery(destination) ? SAUDI_VAT_RATE : null;
}
