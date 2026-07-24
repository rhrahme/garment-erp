import type { Metadata } from "next";

export const metadata: Metadata = {
  title: " ",
};

/** Minimal chrome for dedicated print windows — no sidebar, header, or nav. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-slate-900">{children}</div>;
}
