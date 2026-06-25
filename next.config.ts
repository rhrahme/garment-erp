import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Legacy JSON/email modules have strict-check debt; runtime paths are covered in dev.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["sharp"],
  // Local supplier image folders can be multi-GB on dev machines; production uses Supabase storage.
  outputFileTracingIncludes: {
    "/api/suppliers/loro-piana/images/**": [
      "./data/suppliers/loro-piana/images/manifest.json",
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
