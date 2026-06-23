/** GR Sistemi CUSTOM API — Caccioppoli v1.0 (March 2026) */

export interface CaccioppoliApiError {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
}

export interface CaccioppoliHealthResponse {
  status: "UP" | string;
}

export interface CaccioppoliNetworkResponse {
  status: "UP" | "ERROR" | string;
  message?: string;
}

export interface CaccioppoliUsageResponse {
  year: number;
  username: string;
  clientDescription: string;
  clientCode: string;
  usedRequests: number;
  annualLimit: number;
  remainingRequests: number;
}

/** stato: A = available, AF = available from (date), NA = not available, X = no longer available, NE = not exist */
export interface CaccioppoliAvailabilityRow {
  item: string;
  stato: string;
  info: string;
}

export interface CaccioppoliAvailabilityAllResponse {
  count: number;
  data: CaccioppoliAvailabilityRow[];
}

export interface CaccioppoliImageRow {
  id: number;
  item: string;
  rowNumber: number;
  imgDescription: string;
  imgType: string;
  imgNote: string | null;
  /** Base64 JPEG (no data-URL prefix). */
  imgData: string;
  imgLen: number;
}

export interface CaccioppoliImagesResponse {
  data: CaccioppoliImageRow[];
  requestKey: string;
  clientCode: string;
  count: number;
}

export type CaccioppoliAvailabilityLookupResult =
  | {
      ok: true;
      item: string;
      stato: string;
      info: string;
      stock_status: "in_stock" | "temp_unavailable" | "permanently_unavailable";
      restock_date: string | null;
    }
  | {
      ok: false;
      item: string;
      error: string;
      not_found?: boolean;
    };

export type CaccioppoliImagesLookupResult =
  | {
      ok: true;
      item: string;
      images: CaccioppoliImageRow[];
      /** Primary swatch as data URL (first rowNumber or first image). */
      square: string;
      zoom: string;
    }
  | {
      ok: false;
      item: string;
      error: string;
    };
