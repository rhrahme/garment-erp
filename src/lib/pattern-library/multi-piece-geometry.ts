/**
 * Auto-consolidated multi-piece shells (Suit, Shirt+Short, etc) often have no
 * CAD files of their own - geometry lives on sibling Jacket / Trouser / etc patterns.
 * Hydrate a virtual composite so sheet nest / completeness can see those files.
 */

import {
  findActiveTudAttachment,
  findActiveTudAttachmentForPiece,
} from "@/lib/pattern-library/tud-versions";
import { getGarmentPieces, isMultiPieceGarment } from "@/lib/sales-orders/label-codes";
import type { ClientPattern, PatternLibraryAttachment } from "@/lib/types/pattern-library";

/** Map Suit piece names to sibling garment_type tokens. */
const PIECE_GARMENT_ALIASES: Record<string, string[]> = {
  Jacket: ["jacket", "blazer"],
  Trouser: ["trouser", "trousers", "pants"],
  Vest: ["vest"],
  Shirt: ["shirt", "shirt ls", "shirt ss"],
  "Shirt LS": ["shirt", "shirt ls"],
  "Shirt SS": ["shirt", "shirt ss"],
  Short: ["short", "shorts"],
  // Imported overshirts are often typed as "shirt"; keep "shirt" as a fallback
  // so Overshirt+Trouser shells can still borrow geometry (fabric-line score picks
  // the right sibling when a true Shirt pattern also exists).
  Overshirt: ["overshirt", "over shirt", "shirt"],
  Thobe: ["thobe", "formal thobe", "house thobe"],
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function garmentTypeMatchesPiece(garmentType: string, pieceName: string): boolean {
  const piece = pieceName.trim();
  if (!piece) return false;
  const gt = normalizeToken(garmentType);
  if (gt === normalizeToken(piece)) return true;
  const aliases = PIECE_GARMENT_ALIASES[piece] ?? [normalizeToken(piece)];
  return aliases.includes(gt);
}

function sharedFabricLineScore(a: ClientPattern, b: ClientPattern): number {
  const aLines = new Set(a.linked_fabric_line_ids ?? []);
  if (aLines.size === 0) return 0;
  let score = 0;
  for (const id of b.linked_fabric_line_ids ?? []) {
    if (aLines.has(id)) score += 1;
  }
  return score;
}

/**
 * Best sibling pattern for one garment piece (same client, matching garment type).
 * Prefers overlap on linked fabric lines, then more recent update.
 */
export function findSiblingPatternForPiece(
  parent: ClientPattern,
  pieceName: string,
  allPatterns: ClientPattern[]
): ClientPattern | null {
  const candidates = allPatterns.filter(
    (candidate) =>
      candidate.id !== parent.id &&
      candidate.client_id === parent.client_id &&
      garmentTypeMatchesPiece(candidate.garment_type, pieceName)
  );
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const scoreDiff = sharedFabricLineScore(parent, b) - sharedFabricLineScore(parent, a);
    if (scoreDiff !== 0) return scoreDiff;
    return b.updated_at.localeCompare(a.updated_at);
  });
  return candidates[0] ?? null;
}

function cloneAttachmentForPiece(
  source: PatternLibraryAttachment,
  pieceName: string,
  role: "tud" | "dxf",
  sourcePatternId: string
): PatternLibraryAttachment {
  return {
    ...source,
    id: `borrowed-${role}-${pieceName}-${source.id}`,
    piece_name: pieceName,
    borrowed_from_pattern_id: sourcePatternId,
  };
}

function listDxfAttachments(pattern: ClientPattern): PatternLibraryAttachment[] {
  return pattern.files
    .filter((file) => file.kind === "dxf" && (file.dxf?.pieces?.length ?? 0) > 0)
    .slice()
    .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
}

function findActiveDxfOnPattern(pattern: ClientPattern): PatternLibraryAttachment | null {
  return listDxfAttachments(pattern)[0] ?? null;
}

/** Active DXF for a piece slot (piece_name tag), else null. */
export function findActiveDxfAttachmentForPiece(
  pattern: ClientPattern,
  pieceName: string
): PatternLibraryAttachment | null {
  const piece = pieceName.trim();
  if (!piece) return null;
  const tagged = listDxfAttachments(pattern).filter(
    (file) => (file.piece_name ?? "").trim() === piece
  );
  return tagged[0] ?? null;
}

export type MultiPieceHydration = {
  pattern: ClientPattern;
  /** True when files were borrowed from sibling piece patterns. */
  borrowed: boolean;
  borrowed_from: Record<string, string>;
};

/**
 * For multi-piece shells missing piece TUDs/DXFs, borrow active files from
 * sibling Jacket/Trouser/etc patterns (same client, fabric-line overlap preferred).
 * Returns a virtual pattern - does not persist.
 */
export function hydrateMultiPieceGeometry(
  pattern: ClientPattern,
  allPatterns: ClientPattern[]
): MultiPieceHydration {
  if (!isMultiPieceGarment(pattern.garment_type)) {
    return { pattern, borrowed: false, borrowed_from: {} };
  }

  const pieces = getGarmentPieces(pattern.garment_type);
  const borrowed_from: Record<string, string> = {};
  const extraFiles: PatternLibraryAttachment[] = [];
  const nextActiveByPiece: Record<string, string> = {
    ...(pattern.active_tud_by_piece ?? {}),
  };

  let width =
    typeof pattern.marker_fabric_width_cm === "number" && pattern.marker_fabric_width_cm > 0
      ? pattern.marker_fabric_width_cm
      : null;
  let fold =
    pattern.marker_double_fold === true || pattern.marker_double_fold === false
      ? pattern.marker_double_fold
      : null;
  let baseSize = pattern.base_size;

  for (const piece of pieces) {
    const hasTud = Boolean(findActiveTudAttachmentForPiece(pattern, piece));
    const hasDxf = Boolean(findActiveDxfAttachmentForPiece(pattern, piece));
    if (hasTud && hasDxf) continue;

    const sibling = findSiblingPatternForPiece(pattern, piece, allPatterns);
    if (!sibling) continue;

    if (!hasTud) {
      const tud =
        findActiveTudAttachmentForPiece(sibling, piece) ?? findActiveTudAttachment(sibling);
      if (tud?.tud) {
        const cloned = cloneAttachmentForPiece(tud, piece, "tud", sibling.id);
        extraFiles.push(cloned);
        nextActiveByPiece[piece] = cloned.id;
        borrowed_from[piece] = sibling.id;
      }
    }

    if (!hasDxf) {
      const dxf =
        findActiveDxfAttachmentForPiece(sibling, piece) ?? findActiveDxfOnPattern(sibling);
      if (dxf?.dxf?.pieces?.length) {
        extraFiles.push(cloneAttachmentForPiece(dxf, piece, "dxf", sibling.id));
        borrowed_from[piece] = sibling.id;
      }
    }

    if (width == null) {
      const siblingWidth = sibling.marker_fabric_width_cm;
      if (typeof siblingWidth === "number" && siblingWidth > 0) width = siblingWidth;
    }
    if (fold == null) {
      if (sibling.marker_double_fold === true || sibling.marker_double_fold === false) {
        fold = sibling.marker_double_fold;
      }
    }
    if (!baseSize?.trim() && sibling.base_size?.trim()) {
      baseSize = sibling.base_size;
    }
  }

  if (extraFiles.length === 0 && width == null && fold == null) {
    return { pattern, borrowed: false, borrowed_from: {} };
  }

  return {
    pattern: {
      ...pattern,
      files: [...pattern.files, ...extraFiles],
      active_tud_by_piece: nextActiveByPiece,
      marker_fabric_width_cm: width ?? pattern.marker_fabric_width_cm,
      marker_double_fold: fold ?? pattern.marker_double_fold,
      base_size: baseSize ?? pattern.base_size,
    },
    borrowed: extraFiles.length > 0,
    borrowed_from,
  };
}
