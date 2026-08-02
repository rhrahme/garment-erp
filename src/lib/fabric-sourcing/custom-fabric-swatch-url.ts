/** Client-safe API route URL for a custom / one-off fabric swatch image. */
export function customFabricSwatchImageUrl(imageId: string): string {
  return `/api/custom-fabrics/images/${encodeURIComponent(imageId)}`;
}
