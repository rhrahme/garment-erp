/** Client-side OS hint for sticker print instructions (Mac vs Windows). */
export type StickerPrintPlatform = "mac" | "windows" | "other";

export function detectStickerPrintPlatform(): StickerPrintPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const platform = navigator.platform ?? "";
  if (/Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS X/.test(ua)) return "mac";
  if (/Win/.test(platform) || /Windows/.test(ua)) return "windows";
  return "other";
}

export type StickerPrintGuideStep = {
  title: string;
  detail: string;
};

export type StickerPrintGuide = {
  platform: StickerPrintPlatform;
  headline: string;
  steps: StickerPrintGuideStep[];
  fallback?: string;
  doNot?: string;
};

const DRIVER_MEDIA = "51 × 102 mm portrait";
const PRINTER = "D550 / LabelLife";

function macGuide(): StickerPrintGuide {
  return {
    platform: "mac",
    headline: "One-click print from the browser",
    steps: [
      {
        title: "Click Print",
        detail:
          "A popup opens with one landscape label page per sticker (QR left, text horizontal), then your system print dialog.",
      },
      {
        title: "Choose your thermal printer",
        detail: `Select ${PRINTER}. Turn OFF “Headers and footers”. Margins: None. Paper: ${DRIVER_MEDIA}. Scale: 100% — do NOT use Fit to page if the preview clips.`,
      },
      {
        title: "Scan a QR to verify",
        detail: "One label should feed per page with a full QR on the left. Scan with Fabric Receiving.",
      },
    ],
    fallback: `If the preview is blank or clipped, use Download PDF → Preview → Print at 100% on ${DRIVER_MEDIA}, Fit to paper.`,
  };
}

function windowsGuide(): StickerPrintGuide {
  return {
    platform: "windows",
    headline: "One-click print from the browser",
    steps: [
      {
        title: "Click Print",
        detail:
          "A popup opens with one landscape label page per sticker (QR left, text horizontal), then your system print dialog.",
      },
      {
        title: "Choose your thermal printer",
        detail: `Select ${PRINTER}. Turn OFF “Headers and footers”. Margins: None. Paper: ${DRIVER_MEDIA}. Scale: 100% — not Fit to page.`,
      },
      {
        title: "Scan a QR to verify",
        detail: "One label feeds per page with a full QR on the left. Scan with Fabric Receiving.",
      },
    ],
    fallback: `If the preview is blank or clipped, use Download PDF → Print at 100% on ${DRIVER_MEDIA}, or import into LabelLife.`,
  };
}

function otherGuide(): StickerPrintGuide {
  return {
    platform: "other",
    headline: "One-click print from the browser",
    steps: [
      {
        title: "Click Print",
        detail: "The system print dialog opens with one landscape label page per sticker.",
      },
      {
        title: "Choose the thermal printer",
        detail: `Select ${PRINTER}, paper ${DRIVER_MEDIA}, margins None, headers/footers OFF, scale 100%.`,
      },
      {
        title: "Verify output",
        detail: "One label per page; full QR on the left, text horizontal.",
      },
    ],
    fallback: "If blank or clipped, download PDF and print at 100% on 51×102 mm media.",
  };
}

export function stickerPrintGuide(platform = detectStickerPrintPlatform()): StickerPrintGuide {
  if (platform === "mac") return macGuide();
  if (platform === "windows") return windowsGuide();
  return otherGuide();
}
