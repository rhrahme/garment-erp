import {
  formatLabelGarmentDescription,
  getGarmentPieces,
  pieceNameFromPieceMark,
} from "@/lib/sales-orders/label-codes";

export type SewingSessionArticleFields = {
  garment_type?: string | null;
  piece_mark?: string | null;
};

/**
 * Floor-facing article label under the stitcher name.
 * Prefer the piece being sewn for multi-piece sets (Overshirt), else parent type (Jacket).
 */
export function sewingSessionArticleLabel(session: SewingSessionArticleFields): string {
  const type = session.garment_type?.trim() || "";
  const piece = pieceNameFromPieceMark(session.piece_mark);
  if (type && piece) {
    if (getGarmentPieces(type).length > 1) return piece;
    return formatLabelGarmentDescription(type, piece);
  }
  if (type) return type;
  if (piece) return piece;
  return "";
}
