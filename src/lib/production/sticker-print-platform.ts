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

const MEDIA = "51 × 102 mm";
const PRINTER = "D550 / LabelLife";

function macGuide(): StickerPrintGuide {
  return {
    platform: "mac",
    headline: "One-click print from the browser",
    steps: [
      {
        title: "Click Print",
        detail: `A popup opens with one ${MEDIA} bilevel PNG per label, then your system print dialog (no download).`,
      },
      {
        title: "Choose your thermal printer",
        detail: `Select ${PRINTER}, turn OFF “Headers and footers”, margins None. Set paper to ${MEDIA} portrait if the preview looks wrong.`,
      },
      {
        title: "Scan a QR to verify",
        detail: "One label should feed per page with QR on the left and text horizontal. Scan with Fabric Receiving.",
      },
    ],
    fallback: `If the preview is blank or wrong size, use Download PNG → Preview → Print at 100% on ${MEDIA}.`,
  };
}

function windowsGuide(): StickerPrintGuide {
  return {
    platform: "windows",
    headline: "One-click print from the browser",
    steps: [
      {
        title: "Click Print",
        detail: `A popup opens with one ${MEDIA} bilevel PNG per label, then your system print dialog (no download).`,
      },
      {
        title: "Choose your thermal printer",
        detail: `Select ${PRINTER}, turn OFF “Headers and footers”, margins None. Set paper to ${MEDIA} portrait if the preview looks wrong.`,
      },
      {
        title: "Scan a QR to verify",
        detail: "One label feeds per page with QR on the left and text horizontal. Scan with Fabric Receiving.",
      },
    ],
    fallback: `If the preview is blank, use Download PNG → open in Photos/Paint → Print at 100% on ${MEDIA}, or import into LabelLife.`,
  };
}

function otherGuide(): StickerPrintGuide {
  return {
    platform: "other",
    headline: "One-click print from the browser",
    steps: [
      {
        title: "Click Print",
        detail: `The system print dialog opens with one ${MEDIA} page per label.`,
      },
      {
        title: "Choose the thermal printer",
        detail: `Select ${PRINTER}, paper ${MEDIA} portrait, margins None, headers/footers OFF.`,
      },
      {
        title: "Verify output",
        detail: "One label per page; QR on the left, text horizontal.",
      },
    ],
    fallback: "If blank, download PNG and print at 100% on 51×102 mm media.",
  };
}

export function stickerPrintGuide(platform = detectStickerPrintPlatform()): StickerPrintGuide {
  if (platform === "mac") return macGuide();
  if (platform === "windows") return windowsGuide();
  return otherGuide();
}
