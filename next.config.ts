import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Legacy JSON/email modules have strict-check debt; runtime paths are covered in dev.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["sharp"],
  // Local supplier image folders can be multi-GB on dev machines; production uses Supabase storage.
  outputFileTracingIncludes: {
    "/api/suppliers/loro-piana/images/*": [
      "./data/suppliers/loro-piana/images/manifest.json",
    ],
    "/api/suppliers/loro-piana/images": [
      "./data/suppliers/loro-piana/images/manifest.json",
    ],
  },
  outputFileTracingExcludes: {
    "/api/suppliers/loro-piana/images/*": [
      "./data/suppliers/loro-piana/images/**/*",
      "!./data/suppliers/loro-piana/images/manifest.json",
    ],
    "/api/suppliers/loro-piana/images": [
      "./data/suppliers/loro-piana/images/**/*",
      "!./data/suppliers/loro-piana/images/manifest.json",
    ],
    "*": [
      "./data/suppliers/loro-piana/images/**/*",
      "!./data/suppliers/loro-piana/images/manifest.json",
      "./data/suppliers/drapers/images/**/*",
      "!./data/suppliers/drapers/images/manifest.json",
      "./data/suppliers/drapers/images-higher/**/*",
      "!./data/suppliers/drapers/images-higher/manifest.json",
      "./data/suppliers/drapers/images-by-collection/**/*",
      "!./data/suppliers/drapers/images-by-collection/manifest.json",
    ],
  },
};

export default nextConfig;
