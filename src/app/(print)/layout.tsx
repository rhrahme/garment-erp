import type { Metadata } from "next";
import { stickerPrintStyles } from "@/lib/production/sticker-print-styles";

export const metadata: Metadata = {
  title: " ",
};

/** Minimal chrome for thermal sticker printing — no sidebar, header, or nav. */
export default function StickerPrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticker-print-root min-h-screen bg-white">
      <style dangerouslySetInnerHTML={{ __html: stickerPrintStyles() }} />
      {children}
    </div>
  );
}
