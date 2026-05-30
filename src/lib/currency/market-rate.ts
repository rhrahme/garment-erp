export interface EurSarMarketSnapshot {
  marketRate: number | null;
  fetchedAt: string;
  source: string | null;
}

export async function fetchMarketEurToSar(): Promise<EurSarMarketSnapshot> {
  const fetchedAt = new Date().toISOString();

  try {
    const response = await fetch("https://open.er-api.com/v6/latest/EUR", {
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      return { marketRate: null, fetchedAt, source: null };
    }

    const data = (await response.json()) as {
      result?: string;
      rates?: { SAR?: number };
    };

    const rate = data.rates?.SAR;
    if (typeof rate === "number" && Number.isFinite(rate)) {
      return { marketRate: rate, fetchedAt, source: "open.er-api.com" };
    }
  } catch {
    // fall through
  }

  return { marketRate: null, fetchedAt, source: null };
}
