import {
  DRAPERS_API_BASE_URL,
  DRAPERS_API_DISPLAY_NAME,
  DRAPERS_API_PAGE_LIMIT,
  getDrapersApiKey,
} from "@/lib/integrations/drapers/config";
import {
  drapersFabricCodeCandidates,
  mapDrapersStockRow,
} from "@/lib/integrations/drapers/stock";
import type {
  DrapersApiEnvelope,
  DrapersFabricDetail,
  DrapersFabricMedias,
  DrapersFabricMediasLookupResult,
  DrapersHelloWorldData,
  DrapersPricelistRow,
  DrapersStockLookupResult,
  DrapersStockRow,
} from "@/lib/integrations/drapers/types";

function buildUrl(path: string, query: Record<string, string | number | undefined> = {}): string {
  const apiKey = getDrapersApiKey();
  if (!apiKey) throw new Error("DRAPERS_API_KEY is not set in .env.local.");

  const normalized = path.replace(/^\//, "").replace(/\/$/, "");
  const url = new URL(`${DRAPERS_API_BASE_URL}/${normalized}/`);
  url.searchParams.set("ak", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function drapersGet<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<DrapersApiEnvelope<T>> {
  const url = buildUrl(path, query);
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Drapers API HTTP ${response.status} for ${path}`);
  }

  const payload = (await response.json()) as DrapersApiEnvelope<T>;
  if (payload.status === "error") {
    const message = payload.error?.message ?? `Drapers API error on ${path}`;
    throw new Error(message);
  }

  return payload;
}

export async function fetchDrapersHelloWorld(): Promise<DrapersApiEnvelope<DrapersHelloWorldData>> {
  return drapersGet<DrapersHelloWorldData>("helloworld");
}

export async function testDrapersApiConnection(): Promise<{
  ok: boolean;
  message: string;
  profile?: DrapersHelloWorldData;
  sample?: DrapersStockLookupResult;
}> {
  if (!getDrapersApiKey()) {
    return { ok: false, message: "DRAPERS_API_KEY is not configured." };
  }

  const hello = await fetchDrapersHelloWorld();
  if (!hello.data?.capabilities?.stock) {
    return {
      ok: false,
      message: "API key is valid but stock permission is not enabled on your Drapers account.",
      profile: hello.data,
    };
  }

  const sample = await lookupDrapersFabricStock("10101");
  if (!sample.ok) {
    return {
      ok: false,
      message: sample.error,
      profile: hello.data,
      sample,
    };
  }

  const exp = hello.data.access_key.expiration_date;
  const expDate = exp ? new Date(exp * 1000).toISOString().slice(0, 10) : "—";

  return {
    ok: true,
    message: `${DRAPERS_API_DISPLAY_NAME} connected — stock active (key expires ${expDate}).`,
    profile: hello.data,
    sample,
  };
}

export async function lookupDrapersFabricStock(fabricNumber: string): Promise<DrapersStockLookupResult> {
  const candidates = drapersFabricCodeCandidates(fabricNumber);
  let lastError: DrapersStockLookupResult | null = null;

  for (const code of candidates) {
    try {
      const payload = await drapersGet<DrapersStockRow>(`stock/${encodeURIComponent(code)}`);
      const row = Array.isArray(payload.data) ? payload.data[0] : payload.data;
      if (!row?.fabric_code) {
        lastError = { ok: false, fabric_code: code, error: "Fabric not found in Drapers stock API." };
        continue;
      }

      const mapped = mapDrapersStockRow(row);
      return {
        ok: true,
        fabric_code: row.fabric_code,
        quantity_meters: mapped.quantity_meters,
        in_stock: row.in_stock,
        in_restock: row.in_restock,
        stock_status: mapped.stock_status,
        restock_date: mapped.restock_date,
      };
    } catch (error) {
      lastError = {
        ok: false,
        fabric_code: code,
        error: error instanceof Error ? error.message : "Stock lookup failed",
      };
    }
  }

  return (
    lastError ?? {
      ok: false,
      fabric_code: fabricNumber,
      error: "No response from Drapers stock API.",
    }
  );
}

export async function fetchAllDrapersStockPages(options?: {
  pageLimit?: number;
  onPage?: (page: number, rows: DrapersStockRow[]) => void;
}): Promise<DrapersStockRow[]> {
  const all: DrapersStockRow[] = [];
  const maxPages = options?.pageLimit ?? 500;
  let page = 1;

  while (page <= maxPages) {
    const payload = await drapersGet<DrapersStockRow[]>("stock", {
      page,
      limit: DRAPERS_API_PAGE_LIMIT,
    });

    const rows = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
    if (rows.length === 0) break;

    all.push(...rows);
    options?.onPage?.(page, rows);

    if (rows.length < DRAPERS_API_PAGE_LIMIT) break;
    page += 1;
  }

  return all;
}

export async function fetchDrapersFabricDetail(fabricNumber: string): Promise<DrapersFabricDetail | null> {
  const candidates = drapersFabricCodeCandidates(fabricNumber);
  for (const code of candidates) {
    try {
      const payload = await drapersGet<DrapersFabricDetail>(`fabrics/${encodeURIComponent(code)}`);
      const row = Array.isArray(payload.data) ? payload.data[0] : payload.data;
      if (row?.fabric_code) return row;
    } catch {
      continue;
    }
  }
  return null;
}

export async function lookupDrapersFabricMedias(fabricNumber: string): Promise<DrapersFabricMediasLookupResult> {
  const candidates = drapersFabricCodeCandidates(fabricNumber);
  let lastError: DrapersFabricMediasLookupResult | null = null;

  for (const code of candidates) {
    try {
      const payload = await drapersGet<DrapersFabricMedias>(
        `fabrics/${encodeURIComponent(code)}/medias`
      );
      const medias = Array.isArray(payload.data) ? payload.data[0] : payload.data;
      if (!medias?.square) {
        lastError = { ok: false, fabric_code: code, error: "No swatch images returned for this fabric." };
        continue;
      }

      const detail = await fetchDrapersFabricDetail(code);
      return { ok: true, fabric_code: code, medias, detail: detail ?? undefined };
    } catch (error) {
      lastError = {
        ok: false,
        fabric_code: code,
        error: error instanceof Error ? error.message : "Media lookup failed",
      };
    }
  }

  return (
    lastError ?? {
      ok: false,
      fabric_code: fabricNumber,
      error: "No response from Drapers media API.",
    }
  );
}

export async function fetchAllDrapersAccountPricelistPages(options?: {
  pageLimit?: number;
}): Promise<DrapersPricelistRow[]> {
  const all: DrapersPricelistRow[] = [];
  const maxPages = options?.pageLimit ?? 500;
  let page = 1;

  while (page <= maxPages) {
    const payload = await drapersGet<DrapersPricelistRow[]>("pricelist/account", {
      page,
      limit: DRAPERS_API_PAGE_LIMIT,
    });

    const rows = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
    if (rows.length === 0) break;

    all.push(...rows);
    if (rows.length < DRAPERS_API_PAGE_LIMIT) break;
    page += 1;
  }

  return all;
}
