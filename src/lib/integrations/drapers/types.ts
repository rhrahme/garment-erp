/** Official Drapers API envelope — https://api.drapersitaly.it/ (v2026.1) */

export interface DrapersApiEnvelope<T> {
  data: T;
  count: number | null;
  endpoints: string[];
  status: "success" | "error" | string;
  error: { code: number | string | null; message: string | null };
}

export interface DrapersHelloWorldData {
  access_key: {
    key: string;
    reference: string;
    creation_date: number;
    expiration_date: number;
    latest_use_date: number | null;
  };
  profile: {
    reference: string;
    rate_limit: number | null;
    current_rate: number;
  };
  capabilities: {
    stock: boolean;
    collection: boolean;
    collection_media: boolean;
    pricelist: boolean;
    carts: boolean;
    orders: boolean;
    account_profile?: boolean;
    account_session?: boolean;
  };
}

export interface DrapersStockRow {
  fabric_code: string;
  endpoint?: string;
  quantity: string;
  in_stock: boolean;
  in_restock: boolean;
  restock_date: string | null;
  update_date?: number;
}

/** GET /pricelist/account/ — account-specific fabric prices (v2026.1) */
export interface DrapersPricelistRow {
  fabric_code: string;
  endpoint?: string;
  list_price: string;
  actual_price: string;
  update_date?: number;
}

/** GET /fabrics/{code}/ — catalog row (collection capability) */
export interface DrapersFabricDetail {
  fabric_code: string;
  brand: string;
  bunch: string;
  fibres: string;
  list_price: string;
  actual_price: string;
  is_available: boolean;
}

/** GET /fabrics/{code}/medias/ — swatch images (collection_media capability) */
export interface DrapersFabricMedias {
  square: string;
  zoom: string;
  ruler: string;
}

export type DrapersFabricMediasLookupResult =
  | { ok: true; fabric_code: string; medias: DrapersFabricMedias; detail?: DrapersFabricDetail }
  | { ok: false; fabric_code: string; error: string };

export type DrapersStockLookupResult =
  | {
      ok: true;
      fabric_code: string;
      quantity_meters: number;
      in_stock: boolean;
      in_restock: boolean;
      stock_status: "in_stock" | "temp_unavailable" | "permanently_unavailable";
      restock_date: string | null;
    }
  | {
      ok: false;
      fabric_code: string;
      error: string;
    };
