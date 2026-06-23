import {
  CACCIOPPOLI_API_BASE_URL,
  CACCIOPPOLI_API_DISPLAY_NAME,
  CACCIOPPOLI_CLIENT_CODE,
  CACCIOPPOLI_IMAGES_PAGE_SIZE,
  getCaccioppoliApiToken,
} from "@/lib/integrations/caccioppoli/config";
import {
  caccioppoliItemCandidates,
  mapCaccioppoliAvailabilityRow,
  normalizeCaccioppoliItemCode,
} from "@/lib/integrations/caccioppoli/availability";
import type {
  CaccioppoliApiError,
  CaccioppoliAvailabilityAllResponse,
  CaccioppoliAvailabilityLookupResult,
  CaccioppoliAvailabilityRow,
  CaccioppoliHealthResponse,
  CaccioppoliImagesLookupResult,
  CaccioppoliImagesResponse,
  CaccioppoliImageRow,
  CaccioppoliNetworkResponse,
  CaccioppoliUsageResponse,
} from "@/lib/integrations/caccioppoli/types";

function authHeaders(): HeadersInit {
  const token = getCaccioppoliApiToken();
  if (!token) throw new Error("CACCIOPPOLI_API_TOKEN is not set in .env.local.");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Caccioppoli API HTTP ${response.status}`;
    try {
      const error = (await response.json()) as CaccioppoliApiError;
      if (error.message) message = error.message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

async function caccioppoliGet<T>(path: string): Promise<T> {
  const url = `${CACCIOPPOLI_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: "GET",
    headers: authHeaders(),
    cache: "no-store",
  });
  return parseJson<T>(response);
}

async function caccioppoliPost<T>(path: string, body: unknown = {}): Promise<T> {
  const url = `${CACCIOPPOLI_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  return parseJson<T>(response);
}

export async function fetchCaccioppoliHealth(): Promise<CaccioppoliHealthResponse> {
  const url = `${CACCIOPPOLI_API_BASE_URL}/health`;
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  return parseJson<CaccioppoliHealthResponse>(response);
}

export async function fetchCaccioppoliNetwork(): Promise<CaccioppoliNetworkResponse> {
  return caccioppoliGet<CaccioppoliNetworkResponse>("/network");
}

export async function fetchCaccioppoliUsage(): Promise<CaccioppoliUsageResponse> {
  return caccioppoliGet<CaccioppoliUsageResponse>(`/${CACCIOPPOLI_CLIENT_CODE}/usage`);
}

export function caccioppoliImageToDataUrl(imgData: string): string {
  const trimmed = imgData.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) return trimmed;
  return `data:image/jpeg;base64,${trimmed}`;
}

export function pickPrimaryCaccioppoliImage(images: CaccioppoliImageRow[]): CaccioppoliImageRow | null {
  if (images.length === 0) return null;
  const sorted = [...images].sort((a, b) => a.rowNumber - b.rowNumber);
  return sorted.find((img) => img.rowNumber === 1) ?? sorted[0] ?? null;
}

export async function lookupCaccioppoliAvailability(
  fabricNumber: string
): Promise<CaccioppoliAvailabilityLookupResult> {
  const candidates = caccioppoliItemCandidates(fabricNumber);
  let lastError: CaccioppoliAvailabilityLookupResult | null = null;

  for (const item of candidates) {
    try {
      const row = await caccioppoliPost<CaccioppoliAvailabilityRow>(
        `/${CACCIOPPOLI_CLIENT_CODE}/cc_availability`,
        { item }
      );
      const mapped = mapCaccioppoliAvailabilityRow(row);
      if (mapped.not_found) {
        lastError = { ok: false, item, error: row.info || "Item not found in Caccioppoli API.", not_found: true };
        continue;
      }

      return {
        ok: true,
        item: row.item,
        stato: row.stato,
        info: row.info,
        stock_status: mapped.stock_status,
        restock_date: mapped.restock_date,
      };
    } catch (error) {
      lastError = {
        ok: false,
        item,
        error: error instanceof Error ? error.message : "Availability lookup failed",
      };
    }
  }

  return (
    lastError ?? {
      ok: false,
      item: fabricNumber,
      error: "No response from Caccioppoli availability API.",
    }
  );
}

export async function fetchCaccioppoliAvailabilityAll(): Promise<CaccioppoliAvailabilityRow[]> {
  const payload = await caccioppoliPost<CaccioppoliAvailabilityAllResponse>(
    `/${CACCIOPPOLI_CLIENT_CODE}/cc_availability_all`,
    {}
  );
  return payload.data ?? [];
}

export async function lookupCaccioppoliItemImages(fabricNumber: string): Promise<CaccioppoliImagesLookupResult> {
  const candidates = caccioppoliItemCandidates(fabricNumber);
  let lastError: CaccioppoliImagesLookupResult | null = null;

  for (const item of candidates) {
    try {
      const payload = await caccioppoliPost<CaccioppoliImagesResponse>(
        `/${CACCIOPPOLI_CLIENT_CODE}/getItemImages`,
        { item }
      );
      const images = payload.data ?? [];
      if (images.length === 0) {
        lastError = { ok: false, item, error: "No swatch images returned for this item." };
        continue;
      }

      const primary = pickPrimaryCaccioppoliImage(images);
      const square = primary ? caccioppoliImageToDataUrl(primary.imgData) : "";
      if (!square) {
        lastError = { ok: false, item, error: "Image payload was empty." };
        continue;
      }

      return {
        ok: true,
        item: payload.data[0]?.item ?? item,
        images,
        square,
        zoom: square,
      };
    } catch (error) {
      lastError = {
        ok: false,
        item,
        error: error instanceof Error ? error.message : "Image lookup failed",
      };
    }
  }

  return (
    lastError ?? {
      ok: false,
      item: fabricNumber,
      error: "No response from Caccioppoli images API.",
    }
  );
}

export async function fetchCaccioppoliImagesPage(options?: {
  number_of_records?: number;
  from_id?: number;
}): Promise<CaccioppoliImagesResponse> {
  return caccioppoliPost<CaccioppoliImagesResponse>(`/${CACCIOPPOLI_CLIENT_CODE}/getImages`, {
    number_of_records: options?.number_of_records ?? CACCIOPPOLI_IMAGES_PAGE_SIZE,
    from_id: options?.from_id ?? 0,
  });
}

export async function testCaccioppoliApiConnection(): Promise<{
  ok: boolean;
  message: string;
  usage?: CaccioppoliUsageResponse;
  sample?: CaccioppoliAvailabilityLookupResult;
}> {
  if (!getCaccioppoliApiToken()) {
    return { ok: false, message: "CACCIOPPOLI_API_TOKEN is not configured." };
  }

  const health = await fetchCaccioppoliHealth();
  if (health.status !== "UP") {
    return { ok: false, message: "Caccioppoli API health check failed." };
  }

  const network = await fetchCaccioppoliNetwork();
  if (network.status !== "UP") {
    return {
      ok: false,
      message: network.message ?? "Caccioppoli API cannot reach customer data.",
    };
  }

  const usage = await fetchCaccioppoliUsage();
  const sample = await lookupCaccioppoliAvailability("360102");

  if (!sample.ok) {
    return {
      ok: false,
      message: sample.error,
      usage,
      sample,
    };
  }

  return {
    ok: true,
    message: `${CACCIOPPOLI_API_DISPLAY_NAME} connected — ${usage.remainingRequests.toLocaleString()} requests remaining (${usage.clientDescription}).`,
    usage,
    sample,
  };
}

export function buildCaccioppoliAvailabilityMap(
  rows: CaccioppoliAvailabilityRow[]
): Map<string, CaccioppoliAvailabilityRow> {
  const map = new Map<string, CaccioppoliAvailabilityRow>();
  for (const row of rows) {
    const key = normalizeCaccioppoliItemCode(row.item);
    map.set(key, row);
    map.set(row.item.trim(), row);
  }
  return map;
}
