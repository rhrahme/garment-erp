export interface ClientProfile {
  id: string;
  /** Auto-assigned: GL-0526-0001 (brand · month/year joined · sequence) */
  code: string;
  /** Set when the client profile is first saved */
  joined_at: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  /** Production brand(s) this client orders under — fouad-rahme, fouad, gliani, just-uniforms */
  brand_ids: string[];
  contact_person: string | null;
  referred_by_first_name: string | null;
  referred_by_middle_name: string | null;
  referred_by_last_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  payment_terms: string | null;
  /** Generated later on fabric POs — not set on client profile */
  client_reference_prefix: string | null;
  notes: string | null;
  is_active: boolean;
  /** Person client vs ready-made retail brand account (Massimo Dutti, Suit Supply, …) */
  client_kind?: "person" | "retail_brand";
  /**
   * Pending name-change request (QC/non-admins propose, admin approves on the
   * dashboard). Only mutated via the name-change-request endpoints — the bulk
   * PUT /api/clients always carries these over from the stored client.
   */
  name_change_requested_at?: string | null;
  name_change_requested_by?: string | null;
  name_change_first_name?: string | null;
  name_change_middle_name?: string | null;
  name_change_last_name?: string | null;
  /**
   * Ready-made samples the client handed us (his own garment as reference).
   * Only mutated via /api/client-samples — the bulk PUT /api/clients always
   * carries these over from the stored client.
   */
  ready_made_samples?: ClientReadyMadeSample[] | null;
}

export interface ClientReadyMadeSampleImage {
  id: string;
  filename: string;
  stored_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
}

/**
 * A garment the client gave us as a reference sample. The employee who
 * physically receives it must scan their ID badge; the sample stays flagged
 * as "give back to the client" until someone marks it returned.
 */
export interface ClientReadyMadeSample {
  id: string;
  product_type: string | null;
  brand: string | null;
  color: string | null;
  size: string | null;
  notes: string | null;
  images: ClientReadyMadeSampleImage[];
  /** Payroll employee who received the physical sample (badge scan). */
  received_by_employee_id: string | null;
  received_by_employee_name: string | null;
  /** Account that recorded the sample. */
  added_by: string | null;
  added_at: string;
  /** Set when the sample was handed back to the client. */
  returned_at: string | null;
  returned_by: string | null;
}

export interface ClientsFile {
  updated_at: string | null;
  clients: ClientProfile[];
}
