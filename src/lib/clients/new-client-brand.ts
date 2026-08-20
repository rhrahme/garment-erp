/** Brand for a new Clients-page row: sales scope of one, else the open brand tab. */
export function resolveBrandIdsForNewClient(options: {
  scopedBrandIds?: string[] | null;
  selectedBrandId?: string | null;
}): string[] {
  if (options.scopedBrandIds?.length === 1) return [options.scopedBrandIds[0]!];
  if (options.selectedBrandId) return [options.selectedBrandId];
  return [];
}
