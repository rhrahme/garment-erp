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
}

export interface ClientsFile {
  updated_at: string | null;
  clients: ClientProfile[];
}
