import { buildCutNestPreview } from "@/lib/pattern-library/cut-nest-preview";
import type {
  PatternSheetArticlePage,
  PatternSheetData,
  PatternSheetSticker,
} from "@/lib/pattern-library/sheet-data";

export type CutterPrintPage = {
  data: PatternSheetData;
  sticker: PatternSheetSticker | null;
  pageIndex: number;
  pageTotal: number;
  article_code: string | null;
};

/**
 * Cutter pages: one article's fabric + piece QR(s) per page group.
 * Scoped job / single-article -> classic stickers on primary fabric.
 * Consolidated master without job -> one (or more piece) page per article.
 *
 * Client-safe (no Node fs) so PatternSheetPrintView can import it.
 */
export function expandCutterPrintPages(data: PatternSheetData): CutterPrintPage[] {
  const useArticlePack = !data.scoped_job_id && data.article_pages.length > 1;

  if (!useArticlePack) {
    const stickers = data.stickers.length > 0 ? data.stickers : [null];
    const pageTotal = stickers.length;
    return stickers.map((sticker, index) => ({
      data,
      sticker,
      pageIndex: index + 1,
      pageTotal,
      article_code: null,
    }));
  }

  const pages: CutterPrintPage[] = [];
  let pageIndex = 0;
  const flat: Array<{
    data: PatternSheetData;
    sticker: PatternSheetSticker | null;
    article_code: string;
  }> = [];

  for (const article of data.article_pages) {
    const pageData: PatternSheetData = {
      ...data,
      order: article.order,
      fabric: article.fabric,
      stickers: article.stickers,
      cut_nest: buildCutNestPreview(
        data.pattern,
        article.fabric.width_cm ?? data.job?.width_cm ?? null,
        {
          size: data.resolved_base_size ?? data.pattern.base_size,
          garmentQty: 1,
          ordered_length_m: article.fabric.ordered_meters ?? null,
        }
      ),
    };
    const stickers = article.stickers.length > 0 ? article.stickers : [null];
    for (const sticker of stickers) {
      flat.push({ data: pageData, sticker, article_code: article.article_code });
    }
  }

  const pageTotal = flat.length;
  for (const entry of flat) {
    pageIndex += 1;
    pages.push({
      data: entry.data,
      sticker: entry.sticker,
      pageIndex,
      pageTotal,
      article_code: entry.article_code,
    });
  }
  return pages;
}

function fallbackProductionArticle(data: PatternSheetData): PatternSheetArticlePage | null {
  if (!data.fabric && data.stickers.length === 0) return null;
  return {
    line_id: data.job?.sales_order_line_id ?? "primary",
    article_code: data.pattern.pattern_ref,
    garment_type: data.pattern.garment_type,
    so_number: data.order?.so_number ?? "",
    order: data.order ?? {
      so_number: "-",
      order_date: null,
      delivery_date: null,
    },
    fabric: data.fabric ?? {
      fabric_number: data.pattern.fabric ?? "-",
      supplier_name: "-",
      composition: null,
      gsm: null,
      width_cm: null,
      width_inches: null,
      color: null,
    },
    stickers: data.stickers,
  };
}

/**
 * Production / stitcher pages: one A4 per fabric article (code + floor QR).
 * Scoped job -> that job's article only. Unscoped multi-link -> every article.
 */
export function expandProductionArticlePages(
  data: PatternSheetData
): PatternSheetArticlePage[] {
  if (data.scoped_job_id) {
    const lineId = data.job?.sales_order_line_id ?? null;
    const byLine =
      lineId != null
        ? data.article_pages.find((page) => page.line_id === lineId)
        : null;
    if (byLine) return [byLine];
    const byFabric = data.fabric?.fabric_number
      ? data.article_pages.find(
          (page) => page.fabric.fabric_number === data.fabric!.fabric_number
        )
      : null;
    if (byFabric) return [byFabric];
    const fallback = fallbackProductionArticle(data);
    return fallback ? [fallback] : [];
  }

  if (data.article_pages.length > 0) return data.article_pages;
  const fallback = fallbackProductionArticle(data);
  return fallback ? [fallback] : [];
}
