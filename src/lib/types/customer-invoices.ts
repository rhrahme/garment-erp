import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";

export type CustomerInvoiceStatus = "draft" | "sent" | "paid";

export interface CustomerInvoiceLine {
  id: string;
  /** Matches fabric line order on sales order / costing (1 = first fabric line). */
  article_number: number | null;
  /** Links back to sales order fabric line for enrichment. */
  sales_order_line_id: string | null;
  description: string;
  garment_type: string;
  piece_name: string | null;
  /** Internal — not shown on client invoice */
  sticker_code: string | null;
  fabric_number: string | null;
  fabric_brand: string | null;
  composition: string | null;
  weight_gsm: number | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  /** Internal cost hint (SAR) — admin editor only, not on client print/PDF */
  cost_hint_sar: number | null;
}

export interface CustomerInvoice {
  id: string;
  invoice_number: string;
  sales_order_id: string;
  so_number: string;
  client_id: string;
  client_code: string;
  client_name: string;
  client_reference: string | null;
  client_email: string | null;
  client_address: string | null;
  payment_terms: string | null;
  currency: "SAR";
  status: CustomerInvoiceStatus;
  invoice_date: string;
  due_date: string | null;
  lines: CustomerInvoiceLine[];
  subtotal: number;
  /** e.g. 0.15 for 15% VAT — applied to subtotal when set */
  vat_rate: number | null;
  vat_amount: number;
  total: number;
  notes: string | null;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
  /** Production brand on the invoice letterhead */
  factory_brand_name: string | null;
  /** Snapshot of internal cost when invoice was created (SAR) */
  total_cost_sar: number | null;
  /** Fabric receive destination — bank details on invoice when RUH */
  delivery_destination: DeliveryDestination | null;
}

export interface CustomerInvoicesFile {
  updated_at: string | null;
  invoices: CustomerInvoice[];
}

export interface CustomerInvoiceSummary {
  invoice_count: number;
  draft_count: number;
  sent_count: number;
  paid_count: number;
  outstanding_sar: number;
  paid_sar: number;
}
