import { READY_MADE_DEFAULT_SIZES } from "@/lib/types/ready-made-catalog";

export function slugReadyMadePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function readyMadeGarmentId(
  brandId: string,
  article: string,
  garmentType: string
): string {
  return [
    "rmg",
    slugReadyMadePart(brandId) || "brand",
    slugReadyMadePart(article) || "article",
    slugReadyMadePart(garmentType) || "garment",
  ].join("-");
}

export function normalizeReadyMadeSize(size: string): string {
  return size.trim().replace(/\s+/g, " ").toUpperCase();
}

export function defaultReadyMadeSizes(): string[] {
  return [...READY_MADE_DEFAULT_SIZES];
}
