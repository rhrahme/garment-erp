"use client";

import { useCallback, useState } from "react";
import {
  downloadAndPrintStickerPdf,
  pdfFilename,
  type StickerPdfRequest,
} from "@/lib/production/print-stickers";

export function useStickerPrint() {
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printGuideOpen, setPrintGuideOpen] = useState(false);
  const [printGuideFilename, setPrintGuideFilename] = useState<string | undefined>();

  const closePrintGuide = useCallback(() => {
    setPrintGuideOpen(false);
    setPrintGuideFilename(undefined);
  }, []);

  const requestPrint = useCallback(
    (request: StickerPdfRequest, onAfterPrint?: () => void) => {
      setPrinting(true);
      setPrintError(null);
      void downloadAndPrintStickerPdf(request, () => {
        setPrinting(false);
        onAfterPrint?.();
      }).then((result) => {
        if (!result.ok) {
          setPrinting(false);
          setPrintError("Sticker PDF failed — check you are logged in and try again.");
          return;
        }
        const sheet = request.sheet ?? "pieces";
        setPrintGuideFilename(result.filename ?? pdfFilename(request.orderId, sheet));
        setPrintGuideOpen(true);
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
    printGuideOpen,
    printGuideFilename,
    closePrintGuide,
  };
}
