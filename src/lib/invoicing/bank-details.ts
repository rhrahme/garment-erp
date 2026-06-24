import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";

export type InvoiceBankDetailsBlock = {
  beneficiary: string;
  iban: string;
  bank_name: string;
  branch_name: string;
  swift_code: string;
};

export type InvoiceIssuerDetails = {
  company_name: string;
  location_line: string;
};

/** Shown on client invoices when fabric is received in Riyadh (RUH). */
export const RIYADH_INVOICE_BANK_DETAILS: InvoiceBankDetailsBlock = {
  beneficiary: "Hagan Industries Company",
  iban: "SA82550000000R0332200106",
  bank_name: "Banque Saudi Fransi",
  branch_name: "Al Ghadir",
  swift_code: "BSFRSARIXXX",
};

/** Shown on client invoices when fabric is received in Dubai (DXB). */
export const DUBAI_INVOICE_BANK_DETAILS: InvoiceBankDetailsBlock = {
  beneficiary: "Vitasartoria",
  iban: "AE360260000515898736901",
  bank_name: "Emirates NBD",
  branch_name: "Business Bay",
  swift_code: "EBILAEADXXX",
};

export const DUBAI_INVOICE_ISSUER: InvoiceIssuerDetails = {
  company_name: "Vitasartoria",
  location_line: "Dubai, United Arab Emirates",
};

export function isRiyadhFabricDelivery(destination: DeliveryDestination | null | undefined): boolean {
  return destination === "RUH";
}

export function isDubaiFabricDelivery(destination: DeliveryDestination | null | undefined): boolean {
  return destination === "DXB";
}

export function getInvoiceBankDetails(
  destination: DeliveryDestination | null | undefined
): InvoiceBankDetailsBlock | null {
  if (isRiyadhFabricDelivery(destination)) return RIYADH_INVOICE_BANK_DETAILS;
  if (isDubaiFabricDelivery(destination)) return DUBAI_INVOICE_BANK_DETAILS;
  return null;
}

export function getInvoiceIssuerDetails(
  destination: DeliveryDestination | null | undefined,
  factoryBrandName: string | null | undefined
): InvoiceIssuerDetails {
  if (isDubaiFabricDelivery(destination)) return DUBAI_INVOICE_ISSUER;
  return {
    company_name: factoryBrandName?.trim() || "Garment Factory",
    location_line: "Riyadh, Saudi Arabia",
  };
}

/** @deprecated Use getInvoiceBankDetails instead. */
export function shouldShowRiyadhInvoiceBankDetails(
  destination: DeliveryDestination | null | undefined
): boolean {
  return isRiyadhFabricDelivery(destination);
}
