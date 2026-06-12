"use client";

import { useCallback, useState } from "react";
import { printStickerPngs, type StickerPdfRequest } from "@/lib/production/print-stickers";

export function useStickerPrint() {
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const requestPrint = useCallback(
    (request: StickerPdfRequest, onAfterPrint?: () => void) => {
      setPrinting(true);
      setPrintError(null);
      void printStickerPngs(request, () => {
        setPrinting(false);
        onAfterPrint?.();
      }).then((result) => {
        if (!result.ok) {
          setPrinting(false);
          setPrintError("Sticker print failed — check you are logged in and try again.");
        }
      });
    },
    []
  );

  const clearPrintError = useCallback(() => setPrintError(null), []);

  return {
    printing,
    printError,
    clearPrintError,
    requestPrint,
  };
}
