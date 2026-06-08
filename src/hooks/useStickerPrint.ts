"use client";

import { useCallback, useState } from "react";
import {
  hasSeenStickerPrintHeadersHint,
  printStickerLabels,
} from "@/lib/production/print-stickers";

export function useStickerPrint() {
  const [bannerOpen, setBannerOpen] = useState(false);
  const [pendingAfterPrint, setPendingAfterPrint] = useState<(() => void) | undefined>();

  const requestPrint = useCallback((onAfterPrint?: () => void) => {
    if (hasSeenStickerPrintHeadersHint()) {
      printStickerLabels(onAfterPrint);
      return;
    }
    setPendingAfterPrint(() => onAfterPrint);
    setBannerOpen(true);
  }, []);

  const confirmBanner = useCallback(() => {
    setBannerOpen(false);
    const afterPrint = pendingAfterPrint;
    setPendingAfterPrint(undefined);
    printStickerLabels(afterPrint);
  }, [pendingAfterPrint]);

  const closeBanner = useCallback(() => {
    setBannerOpen(false);
    setPendingAfterPrint(undefined);
  }, []);

  return {
    bannerOpen,
    requestPrint,
    confirmBanner,
    closeBanner,
  };
}
