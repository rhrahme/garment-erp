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
    headline: "Print from Preview — not the browser",
    steps: [
      {
        title: "Open the PDF in Preview",
        detail: `Find the downloaded PDF in Downloads and double-click it. Preview opens with the correct ${MEDIA} page size.`,
      },
      {
        title: "Print to your thermal printer",
        detail: `Press ⌘P, choose ${PRINTER}, confirm paper size ${MEDIA} portrait, Scale “Fit to paper”, margins None, then Print.`,
      },
      {
        title: "Scan a QR to verify",
        detail: "One label should feed per page with QR on the left and text horizontal. Scan with Fabric Receiving.",
      },
    ],
    doNot: "Do not use ⌘P on the garment ERP browser tab — it defaults to A4 and prints blank or black.",
    fallback: `If Preview still prints blank, download PNG instead → Preview → Print at 100% on ${MEDIA}.`,
  };
}

function windowsGuide(): StickerPrintGuide {
  return {
    platform: "windows",
    headline: "Print from Edge or Adobe Reader — not the browser tab",
    steps: [
      {
        title: "Open the downloaded PDF",
        detail: `In Downloads, double-click the PDF. It opens in Edge or Adobe Reader with ${MEDIA} pages.`,
      },
      {
        title: "Print to your thermal printer",
        detail: `Press Ctrl+P, choose ${PRINTER}, set paper ${MEDIA} portrait, Scale “Fit to paper”, margins None, then Print.`,
      },
      {
        title: "Scan a QR to verify",
        detail: "One label feeds per page with QR on the left and text horizontal. Scan with Fabric Receiving.",
      },
    ],
    doNot: "Do not print from the garment ERP browser tab (Ctrl+P) — paper size defaults to Letter/A4 and labels come out blank.",
    fallback: `If the PDF prints blank, download PNG → open in Photos/Paint → Print at 100% on ${MEDIA}, or import PNG into LabelLife.`,
  };
}

function otherGuide(): StickerPrintGuide {
  return {
    platform: "other",
    headline: "Print from your system PDF viewer",
    steps: [
      {
        title: "Open the downloaded PDF",
        detail: `Open the file from Downloads in your default PDF viewer. Each page is ${MEDIA} portrait.`,
      },
      {
        title: "Print to the thermal printer",
        detail: `Select ${PRINTER}, paper ${MEDIA}, Scale “Fit to paper”, margins None.`,
      },
      {
        title: "Verify output",
        detail: "One label per page; QR on the left, text horizontal.",
      },
    ],
    doNot: "Do not print the HTML page from the browser — use the downloaded PDF only.",
    fallback: "If blank, download PNG and print at 100% on 51×102 mm media.",
  };
}

export function stickerPrintGuide(platform = detectStickerPrintPlatform()): StickerPrintGuide {
  if (platform === "mac") return macGuide();
  if (platform === "windows") return windowsGuide();
  return otherGuide();
}
