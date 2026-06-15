export interface SupplierContactRow {
  id: string;
  code: string;
  name: string;
  country: string | null;
  contact_person: string | null;
  /** All order emails — fabric POs are sent to this full list together. */
  emails: string[];
  /** @deprecated Derived comma-separated list for display; use `emails`. */
  email?: string | null;
  lead_time_days: number;
  has_price_list: boolean;
  /** Supplier list-price currency when not EUR (e.g. Gazaba = AED). */
  currency?: string | null;
  notes: string | null;
  /** Any sender @these domains is treated as this supplier (e.g. loropiana.com). */
  reply_domains?: string[];
}

export interface SupplierContactsFile {
  factory_orders_email: string | null;
  /** Mailbox scanned for supplier replies, invoices, and AWB tracking (IMAP). */
  inbox_scan_email: string | null;
  notes: string | null;
  updated_at: string | null;
  suppliers: SupplierContactRow[];
}
