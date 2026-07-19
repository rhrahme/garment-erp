/** Convert resolved catalog prices into public booleans — never expose amounts. */
export function toPublicFabricCatalogHealthSample(input: {
  fabric_number: string;
  solbiatiUnitPrice: number | null | undefined;
  loroPianaLookupUnitPrice: number | null | undefined;
}) {
  return {
    fabric_number: input.fabric_number,
    solbiati_has_unit_price: input.solbiatiUnitPrice != null,
    loro_piana_lookup_has_unit_price: input.loroPianaLookupUnitPrice != null,
  };
}
