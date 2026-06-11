import type { Metadata } from "next";
import { ensureErpBootstrap } from "@/lib/data/document-persistence";
import "./globals.css";

export const metadata: Metadata = {
  title: "Garment ERP — Factory Management",
  description: "Enterprise resource planning for garment manufacturing",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await ensureErpBootstrap();

  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
