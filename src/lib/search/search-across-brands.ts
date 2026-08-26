import { normalizeSearchText } from "@/lib/search/normalize";

/**
 * A leftover Gilani (or FR) chip must not hide Ibrahim when they type "ibi".
 * Any real search query looks across every house brand.
 */
export function searchLooksAcrossBrands(query: string | null | undefined): boolean {
  return normalizeSearchText(query).length > 0;
}

export function itemsForBrandOrSearch<T>(
  allItems: T[],
  brandScopedItems: T[],
  query: string | null | undefined
): T[] {
  return searchLooksAcrossBrands(query) ? allItems : brandScopedItems;
}

export function patternQueueEmptyCopy(options: {
  search: string;
  brandSelected: boolean;
}): string {
  if (searchLooksAcrossBrands(options.search)) {
    return `No sales orders match "${options.search.trim()}".`;
  }
  if (options.brandSelected) {
    return "No sales orders for this brand in this tab. Tap All brands to see every client.";
  }
  return "No sales orders in this tab.";
}
