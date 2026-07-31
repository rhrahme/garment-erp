/**
 * Shared ASCII-safe PDF/download filename helpers.
 * Prefer meaningful business ids + context: SO-...-Client-....pdf, INV-...-Client.pdf.
 */

/** Collapse to filesystem-safe ASCII slug tokens. */
export function slugPdfToken(value: string | null | undefined, maxLen = 40): string {
  const raw = (value ?? "")
    .normalize("NFKD")
    // Drop combining marks so accented letters become base ASCII before stripping.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/['"]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (!raw) return "";
  return raw.slice(0, maxLen).replace(/-+$/g, "");
}

/** Join slug tokens into `{parts}.{ext}`, trimming to a path-safe length. */
export function buildDownloadFilename(
  parts: Array<string | null | undefined>,
  ext = "pdf",
  maxBaseLen = 140
): string {
  const tokens = parts.map((part) => slugPdfToken(part)).filter(Boolean);
  const base = tokens.join("-") || "download";
  const trimmed = base.length > maxBaseLen ? base.slice(0, maxBaseLen).replace(/-+$/g, "") : base;
  const safeExt = slugPdfToken(ext, 12) || "pdf";
  return `${trimmed}.${safeExt}`;
}

/** Content-Disposition value with ASCII filename= (quotes stripped from name). */
export function contentDisposition(
  filename: string,
  disposition: "attachment" | "inline" = "attachment"
): string {
  const safe = filename.replace(/"/g, "").replace(/[\r\n]/g, "");
  return `${disposition}; filename="${safe}"`;
}

/**
 * Parse filename from a Content-Disposition header.
 * Supports filename="..." and filename*=UTF-8''...
 */
export function parseContentDispositionFilename(header: string | null | undefined): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      const decoded = decodeURIComponent(star[1].trim().replace(/^"+|"+$/g, ""));
      return decoded.replace(/"/g, "").replace(/[\r\n]/g, "") || null;
    } catch {
      // fall through
    }
  }
  const plain = /filename\s*=\s*"([^"]+)"/i.exec(header) ?? /filename\s*=\s*([^;]+)/i.exec(header);
  if (!plain?.[1]) return null;
  return plain[1].trim().replace(/^"+|"+$/g, "").replace(/[\r\n]/g, "") || null;
}

/** Prefer server Content-Disposition; otherwise fallback. */
export function filenameFromResponse(res: Response, fallback: string): string {
  return parseContentDispositionFilename(res.headers.get("Content-Disposition")) ?? fallback;
}

export function buildSalesOrderPdfFilename(order: {
  so_number: string;
  client_name?: string | null;
  client_code?: string | null;
  product_article?: string | null;
}): string {
  return buildDownloadFilename([
    order.so_number,
    order.client_code,
    order.client_name,
    order.product_article,
  ]);
}

export function buildBaseSizeSheetPdfFilename(
  base: {
    house_brand_code?: string | null;
    garment_type?: string | null;
    cut_family?: string | null;
    cut_variant?: string | null;
    name?: string | null;
    id?: string | null;
  },
  size: string
): string {
  const identity = [
    base.house_brand_code,
    base.garment_type,
    base.cut_family,
    base.cut_variant,
  ].some((v) => Boolean(v?.trim()));

  return buildDownloadFilename([
    identity ? base.house_brand_code : null,
    identity ? base.garment_type : null,
    identity ? base.cut_family : null,
    identity ? base.cut_variant : null,
    identity ? null : base.name || base.id,
    "size",
    size,
  ]);
}

/**
 * Invoice/quote download name.
 * Keeps the business invoice number (INV-2026-0007); quotes get a QUOTE- prefix.
 * Optionally appends client slug for scanning Downloads folders.
 */
export function buildCustomerInvoicePdfFilename(input: {
  invoiceNumber: string;
  clientName?: string | null;
  kind?: "invoice" | "quote";
}): string {
  const numberToken = slugPdfToken(input.invoiceNumber, 48);
  const client = slugPdfToken(input.clientName, 36);
  if (input.kind === "quote") {
    const alreadyQuote = numberToken.toUpperCase().startsWith("QUOTE-");
    return buildDownloadFilename([alreadyQuote ? null : "QUOTE", numberToken || "draft", client]);
  }
  return buildDownloadFilename([numberToken || "invoice", client]);
}

export type StickerSheetFilenameKind =
  | "fabric-cuts"
  | "pieces"
  | "print-pack"
  | "test"
  | "calibration";

export function stickerSheetSuffix(sheet: StickerSheetFilenameKind): string {
  if (sheet === "print-pack") return "print-pack";
  if (sheet === "fabric-cuts") return "prep";
  if (sheet === "pieces") return "prod";
  return sheet;
}

export function buildStickerDownloadFilename(input: {
  soNumber?: string | null;
  clientName?: string | null;
  sheet: StickerSheetFilenameKind;
  ext: "pdf" | "png" | "zip";
  /** Single PNG index label (e.g. calibration letter or page number). */
  pageLabel?: string | null;
}): string {
  if (input.sheet === "calibration") {
    if (input.ext === "zip") return "sticker-rotation-calibration.zip";
    if (input.ext === "png") {
      return buildDownloadFilename(
        ["sticker-rotation-calibration", input.pageLabel ?? "A"],
        "png"
      );
    }
    return "sticker-rotation-calibration.pdf";
  }
  if (input.sheet === "test") {
    if (input.ext === "zip") return "sticker-test.zip";
    if (input.ext === "png") {
      return buildDownloadFilename(["sticker-test", input.pageLabel ?? "1"], "png");
    }
    return "sticker-test.pdf";
  }

  const suffix = stickerSheetSuffix(input.sheet);
  const so = input.soNumber?.trim() || "stickers";
  if (input.ext === "png" && input.pageLabel) {
    return buildDownloadFilename([so, input.clientName, "sticker", suffix, input.pageLabel], "png");
  }
  if (input.ext === "zip") {
    return buildDownloadFilename([so, input.clientName, "stickers", suffix], "zip");
  }
  if (input.ext === "png") {
    return buildDownloadFilename([so, input.clientName, "sticker", suffix], "png");
  }
  return buildDownloadFilename([so, input.clientName, "stickers", suffix], "pdf");
}

export function buildEmployeeBadgePdfFilename(input: {
  groupSlug: string;
  /** When a subset is selected, include count for disambiguation. */
  selectedCount?: number | null;
  /** Single-employee download: include name. */
  employeeName?: string | null;
}): string {
  const count =
    input.selectedCount != null && input.selectedCount > 0 && !input.employeeName
      ? String(input.selectedCount)
      : null;
  return buildDownloadFilename([
    "employee-badges",
    input.groupSlug,
    input.employeeName,
    count,
  ]);
}
