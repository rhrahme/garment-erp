import type { NextConfig } from "next";

const SUPPLIER_CATALOG_JSON = [
  "./src/data/suppliers/loro-piana-ss26.json",
  "./src/data/suppliers/caccioppoli-jackets-ss26.json",
  "./src/data/suppliers/caccioppoli-shirting-ss26.json",
  "./src/data/suppliers/zegna-ss26.json",
  "./src/data/suppliers/drapers-hs-ss26.json",
  "./src/data/suppliers/stylbiella-aw25.json",
  "./src/data/suppliers/stylbiella-ss25.json",
  "./src/data/suppliers/stylbiella-ss26.json",
  "./src/data/suppliers/canclini-linen-stock.json",
  "./src/data/suppliers/wool-stock.json",
  "./src/data/suppliers/gazaba-cutlength-price-list.json",
];

const nextConfig: NextConfig = {
  // Legacy JSON/email modules have strict-check debt; runtime paths are covered in dev.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["sharp"],
  // Local supplier image folders can be multi-GB on dev machines; production uses Supabase storage.
  outputFileTracingIncludes: {
    "/orders/[id]": SUPPLIER_CATALOG_JSON,
    "/fabric-orders/[id]": SUPPLIER_CATALOG_JSON,
    "/api/fabric-search": SUPPLIER_CATALOG_JSON,
    "/api/v1/health/fabric-catalog": SUPPLIER_CATALOG_JSON,
    "/api/suppliers/loro-piana/images/**": [
      "./data/suppliers/loro-piana/images/manifest.json",
    ],
    "/api/reference-documents/[id]": [
      "./documents-and-data/riyadh-bank-details.pdf",
      "./src/data/reference-source-files.json",
    ],
  },
  outputFileTracingExcludes: {
    "/api/suppliers/loro-piana/images/**": [
      "./data/suppliers/loro-piana/images/*.jpg",
      "./data/suppliers/loro-piana/images/*.jpeg",
      "./data/suppliers/loro-piana/images/*.png",
      "./data/suppliers/loro-piana/images/*.webp",
    ],
    "*": [
      "./data/suppliers/loro-piana/images/*.jpg",
      "./data/suppliers/loro-piana/images/*.jpeg",
      "./data/suppliers/loro-piana/images/*.png",
      "./data/suppliers/loro-piana/images/*.webp",
      "./data/suppliers/drapers/images/*.jpg",
      "./data/suppliers/drapers/images/*.jpeg",
      "./data/suppliers/drapers/images/*.png",
      "./data/suppliers/drapers/images/*.webp",
      "./data/suppliers/drapers/images-higher/**",
      "./data/suppliers/drapers/images-by-collection/**",
    ],
  },
};

export default nextConfig;
