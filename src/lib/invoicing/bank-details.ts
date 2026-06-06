import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";

/** Shown on client invoices when fabric is received in Riyadh (RUH). */
export const RIYADH_INVOICE_BANK_DETAILS = {
  beneficiary: "Hagan Industries Company",
  iban: "SA82550000000R0332200106",
  bank_name: "Banque Saudi Fransi",
  branch_name: "Al Ghadir",
  swift_code: "BSFRSARIXXX",
} as const;

export function isRiyadhFabricDelivery(destination: DeliveryDestination | null | undefined): boolean {
  return destination === "RUH";
}

export function shouldShowRiyadhInvoiceBankDetails(
  destination: DeliveryDestination | null | undefined
): boolean {
  return isRiyadhFabricDelivery(destination);
}
