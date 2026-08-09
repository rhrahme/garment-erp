import { buildCutNestPreview } from "@/lib/pattern-library/cut-nest-preview";
import { stitcherPieceAllowList } from "@/lib/pattern-library/measurement-template-mode";
import {
  getGarmentPieces,
  isMultiPieceGarment,
} from "@/lib/sales-orders/label-codes";
import type {
  PatternSheetArticlePage,
  PatternSheetData,
  PatternSheetSticker,
} from "@/lib/pattern-library/sheet-data";

export type CutterPrintPage = {
  data: PatternSheetData;
  /** All floor QRs for this fabric article - kept on one A4 (not one page per piece). */
  stickers: PatternSheetSticker[];
  pageIndex: number;
  pageTotal: number;
  article_code: string | null;
};

/**
 * Cutter pages: one A4 per fabric article with every piece QR on that page.
 * Cutter cuts the full nest once - do not split Overshirt/Trouser across pages.
 * Consolidated master without job -> one page per linked fabric article.
 *
 * Client-safe (no Node fs) so PatternSheetPrintView can import it.
 */
export function expandCutterPrintPages(data: PatternSheetData): CutterPrintPage[] {
  const useArticlePack = !data.scoped_job_id && data.article_pages.length > 1;

  if (!useArticlePack) {
    return [
      {
        data,
        stickers: data.stickers,
        pageIndex: 1,
        pageTotal: 1,
        article_code: null,
      },
    ];
  }

  const pageTotal = data.article_pages.length;
  return data.article_pages.map((article, index) => {
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
    return {
      data: pageData,
      stickers: article.stickers,
      pageIndex: index + 1,
      pageTotal,
      article_code: article.article_code,
    };
  });
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
 * Split a multi-piece fabric article into one stitcher A4 per garment piece
 * (Overshirt / Trouser / Jacket...). Single-piece garments (Shorts, Shirt, ...)
 * stay one page even if they have multiple cut-panel QRs.
 */
export function splitArticleIntoStitcherPiecePages(
  article: PatternSheetArticlePage,
  measurements: Array<{ point_id: string; name?: string | null }>,
  dictionary: Array<{ id: string; garment_types: string[]; name?: string }>
): PatternSheetArticlePage[] {
  const pieceStickers = article.stickers.filter((sticker) => sticker.role === "piece");
  const compoundGarment = isMultiPieceGarment(article.garment_type);
  if (!compoundGarment || pieceStickers.length <= 1) {
    return [
      {
        ...article,
        stickers: pieceStickers.length > 0 ? pieceStickers : article.stickers,
        piece_name: article.piece_name ?? null,
        measurement_point_ids: article.measurement_point_ids ?? null,
        measurement_point_names: article.measurement_point_names ?? null,
      },
    ];
  }

  const expected = new Set(
    getGarmentPieces(article.garment_type).map((name) => name.trim().toLowerCase())
  );
  const stitcherStickers = pieceStickers.filter((sticker) =>
    expected.has(sticker.piece_name.trim().toLowerCase())
  );
  const toSplit = stitcherStickers.length > 1 ? stitcherStickers : pieceStickers;
  if (toSplit.length <= 1) {
    return [
      {
        ...article,
        stickers: pieceStickers,
        piece_name: article.piece_name ?? null,
        measurement_point_ids: article.measurement_point_ids ?? null,
        measurement_point_names: article.measurement_point_names ?? null,
      },
    ];
  }

  // Trouser still gets the reduced stitcher set even with an empty dictionary.
  const allowBySticker = toSplit.map((sticker) => ({
    sticker,
    allow: stitcherPieceAllowList(sticker.piece_name, dictionary),
  }));
  const ownedIds = new Set<string>();
  const ownedNames = new Set<string>();
  for (const entry of allowBySticker) {
    for (const id of entry.allow.ids) ownedIds.add(id);
    for (const name of entry.allow.names) ownedNames.add(name);
  }
  const orphanIds: string[] = [];
  const orphanNames: string[] = [];
  for (const row of measurements) {
    const label = row.name?.trim().toLowerCase() ?? "";
    if (ownedIds.has(row.point_id) || (label && ownedNames.has(label))) continue;
    if (row.point_id) orphanIds.push(row.point_id);
    if (label) orphanNames.push(label);
  }

  return allowBySticker.map((entry, index) => {
    const ids = new Set(entry.allow.ids);
    const names = new Set(entry.allow.names);
    if (index === 0) {
      for (const id of orphanIds) ids.add(id);
      for (const name of orphanNames) names.add(name);
    }
    return {
      ...article,
      garment_type: entry.sticker.piece_name,
      stickers: [entry.sticker],
      piece_name: entry.sticker.piece_name,
      measurement_point_ids: [...ids],
      measurement_point_names: [...names],
    };
  });
}

/**
 * Production / stitcher pages: one A4 per fabric article, then one per piece QR
 * when the article is multi-piece (Overshirt+Trouser, Suit, ...).
 * Scoped job -> that job's article only. Unscoped multi-link -> every article.
 */
export function expandProductionArticlePages(
  data: PatternSheetData
): PatternSheetArticlePage[] {
  let articles: PatternSheetArticlePage[] = [];
  if (data.scoped_job_id) {
    const lineId = data.job?.sales_order_line_id ?? null;
    const byLine =
      lineId != null
        ? data.article_pages.find((page) => page.line_id === lineId)
        : null;
    if (byLine) articles = [byLine];
    else {
      const byFabric = data.fabric?.fabric_number
        ? data.article_pages.find(
            (page) => page.fabric.fabric_number === data.fabric!.fabric_number
          )
        : null;
      if (byFabric) articles = [byFabric];
      else {
        const fallback = fallbackProductionArticle(data);
        articles = fallback ? [fallback] : [];
      }
    }
  } else if (data.article_pages.length > 0) {
    articles = data.article_pages;
  } else {
    const fallback = fallbackProductionArticle(data);
    articles = fallback ? [fallback] : [];
  }

  const dictionary = data.measurement_point_index ?? [];
  const measurements = data.version?.measurements ?? [];
  return articles.flatMap((article) =>
    splitArticleIntoStitcherPiecePages(article, measurements, dictionary)
  );
}
