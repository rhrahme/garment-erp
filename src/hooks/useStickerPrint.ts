"use client";

import { useCallback, useState } from "react";
import {
  printStickerPdf,
  type StickerPdfRequest,
} from "@/lib/production/print-stickers";

export function useStickerPrint() {
  const [printing, setPrinting] = useState(false);

  const requestPrint = useCallback(
    (request: StickerPdfRequest, onAfterPrint?: () => void) => {
      setPrinting(true);
      void printStickerPdf(request, () => {
        setPrinting(false);
        onAfterPrint?.();
      }).then((ok) => {
        if (!ok) setPrinting(false);
      });
    },
    []
  );

  return {
    printing,
    requestPrint,
  };
}
