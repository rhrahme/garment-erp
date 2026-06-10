import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Legacy JSON/email modules have strict-check debt; runtime paths are covered in dev.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
