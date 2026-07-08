"use client";

import { useCallback, useState } from "react";
import {
  openStickerPrintPopup,
  printStickerPngs,
  stickerPrintFailureMessage,
  type StickerPdfRequest,
  type StickerPrintFailureReason,
} from "@/lib/production/print-stickers";

export function useStickerPrint() {
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const requestPrint = useCallback(
    (request: StickerPdfRequest, onAfterPrint?: () => void) => {
      setPrinting(true);
      setPrintError(null);

      const popup = openStickerPrintPopup();
      if (!popup) {
        setPrinting(false);
        setPrintError(stickerPrintFailureMessage("popup-blocked"));
        return;
      }

      void printStickerPngs(request, () => {
        setPrinting(false);
        onAfterPrint?.();
      }, popup).then((result) => {
        if (!result.ok) {
          setPrinting(false);
          setPrintError(stickerPrintFailureMessage(result.reason ?? "unknown"));
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

export type { StickerPrintFailureReason };
