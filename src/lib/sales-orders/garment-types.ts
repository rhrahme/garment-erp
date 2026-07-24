export const GARMENT_STITCH_TYPES = [
  "Suit",
  "Jacket",
  "Vest",
  "Trouser",
  "Short",
  "Shirt LS",
  "Shirt SS",
  "Polo",
  "T-shirt",
  "Overshirt",
  "Overshirt+Trouser",
  "Overcoat",
  "Formal Thobe",
  "House Thobe",
  "Thobe+Jacket",
  "Thobe+Vest",
  "Shirt+Trouser",
  "Shirt+Trouser+Short",
  "Shirt+Short",
  "Fabric only",
] as const;

export type GarmentStitchType = (typeof GARMENT_STITCH_TYPES)[number];

export function isGarmentStitchType(value: string): value is GarmentStitchType {
  return (GARMENT_STITCH_TYPES as readonly string[]).includes(value);
}

/** Labels the fabric factory must attach — one per garment piece (e.g. suit = jacket + trouser). */
export const GARMENT_LABEL_COUNTS: Record<GarmentStitchType, number> = {
  Suit: 2,
  Jacket: 1,
  Vest: 1,
  Trouser: 1,
  Short: 1,
  "Shirt LS": 1,
  "Shirt SS": 1,
  Polo: 1,
  "T-shirt": 1,
  Overshirt: 1,
  "Overshirt+Trouser": 2,
  Overcoat: 1,
  "Formal Thobe": 1,
  "House Thobe": 1,
  "Thobe+Jacket": 2,
  "Thobe+Vest": 2,
  "Shirt+Trouser": 2,
  "Shirt+Trouser+Short": 3,
  "Shirt+Short": 2,
  "Fabric only": 0,
};

export function getLabelCountForGarment(garmentType: string): number {
  if (isGarmentStitchType(garmentType)) {
    return GARMENT_LABEL_COUNTS[garmentType];
  }
  return 1;
}

export function getMinLabelCountForGarment(garmentType: string): number {
  return getLabelCountForGarment(garmentType) === 0 ? 0 : 1;
}
