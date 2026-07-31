import {
  findActiveTudAttachment,
  findActiveTudAttachmentForPiece,
} from "@/lib/pattern-library/tud-versions";
import type { ClientPattern, PatternLibraryAttachment } from "@/lib/types/pattern-library";

export interface PatternCuttingCheckItem {
  id: string;
  label: string;
  done: boolean;
  /** When true, item is informational / nest-input and does not block manufacturing. */
  optional?: boolean;
  detail?: string | null;
}

export interface PatternCuttingCompleteness {
  /** All required .TUD piece slots filled. */
  tuds_complete: boolean;
  /** Width + double-fold answered (inputs for future in-ERP nesting). */
  nest_inputs_complete: boolean;
  items: PatternCuttingCheckItem[];
  missing_tud_labels: string[];
  missing_nest_input_labels: string[];
}

/** Marker / nesting files attached to a client pattern (pattern-level + trials). */
export function listMarkerFiles(pattern: ClientPattern): PatternLibraryAttachment[] {
  const all = [
    ...pattern.files,
    ...pattern.versions.flatMap((version) => version.files),
  ];
  return all
    .filter((file) => file.kind === "marker")
    .sort((a, b) => {
      const ta = new Date(a.uploaded_at).getTime();
      const tb = new Date(b.uploaded_at).getTime();
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
}

export function findActiveMarkerAttachment(
  pattern: ClientPattern
): PatternLibraryAttachment | null {
  const markers = listMarkerFiles(pattern);
  const explicit = pattern.active_marker_file_id?.trim() || null;
  if (explicit) {
    const fromMarkers = markers.find((file) => file.id === explicit);
    if (fromMarkers) return fromMarkers;
    const all = [
      ...pattern.files,
      ...pattern.versions.flatMap((version) => version.files),
    ];
    const any = all.find((file) => file.id === explicit);
    if (any) return any;
  }
  if (markers.length === 0) return null;
  return markers[markers.length - 1] ?? null;
}

/**
 * TUKAdesign (.tud) completeness + nest-input readiness (fabric width, double fold).
 *
 * Marker file upload is optional (legacy / archive only) - the product direction is
 * in-ERP nesting from TUD + fabric specs, not mandatory TUKAmark export upload.
 *
 * Multi-piece garments require one .TUD per piece name; single-piece / empty
 * piece lists require at least one pattern-level .TUD.
 */
export function evaluatePatternCuttingCompleteness(
  pattern: ClientPattern,
  requiredPieceNames: string[] = []
): PatternCuttingCompleteness {
  const pieces = requiredPieceNames.map((name) => name.trim()).filter(Boolean);
  const items: PatternCuttingCheckItem[] = [];

  if (pieces.length > 1) {
    for (const piece of pieces) {
      const tud = findActiveTudAttachmentForPiece(pattern, piece);
      items.push({
        id: `tud:${piece}`,
        label: `.TUD - ${piece}`,
        done: Boolean(tud),
        detail: tud?.filename ?? null,
      });
    }
  } else {
    const tud =
      pieces.length === 1
        ? findActiveTudAttachmentForPiece(pattern, pieces[0]!) ??
          findActiveTudAttachment(pattern)
        : findActiveTudAttachment(pattern);
    const label =
      pieces.length === 1 ? `.TUD - ${pieces[0]}` : ".TUD (TUKAdesign)";
    items.push({
      id: pieces.length === 1 ? `tud:${pieces[0]}` : "tud:pattern",
      label,
      done: Boolean(tud),
      detail: tud?.filename ?? null,
    });
  }

  const width = pattern.marker_fabric_width_cm;
  const widthOk = typeof width === "number" && Number.isFinite(width) && width > 0;
  items.push({
    id: "fabric_width",
    label: "Fabric width (cm)",
    done: widthOk,
    detail: widthOk ? `${width} cm` : null,
  });

  const fold = pattern.marker_double_fold;
  const foldSet = fold === true || fold === false;
  items.push({
    id: "double_fold",
    label: "Double fold (yes / no)",
    done: foldSet,
    detail: foldSet ? (fold ? "Double fold" : "Open width") : null,
  });

  // Optional shop TUKAmrk (.tum) - preferred on cutter A4 when present.
  const marker = findActiveMarkerAttachment(pattern);
  const tum = marker?.tum;
  const tumDetail =
    tum && tum.length_cm != null && tum.efficiency_pct != null
      ? `${marker!.filename} · ${tum.length_cm.toFixed(1)} cm · ${tum.efficiency_pct.toFixed(1)}%`
      : marker?.filename ?? null;
  items.push({
    id: "marker_file",
    label: "TUKAmrk .tum (shop marker)",
    done: Boolean(marker),
    optional: true,
    detail: tumDetail,
  });

  const missing_tud_labels = items
    .filter((item) => item.id.startsWith("tud:") && !item.done)
    .map((item) => item.label);
  const missing_nest_input_labels = items
    .filter(
      (item) =>
        (item.id === "fabric_width" || item.id === "double_fold") && !item.done
    )
    .map((item) => item.label);

  return {
    tuds_complete: missing_tud_labels.length === 0,
    nest_inputs_complete: missing_nest_input_labels.length === 0,
    items,
    missing_tud_labels,
    missing_nest_input_labels,
  };
}

export function formatCuttingCompletenessError(
  result: PatternCuttingCompleteness,
  scope: "tud" | "nest_inputs"
): string | null {
  if (scope === "tud") {
    if (result.tuds_complete) return null;
    return `Upload required .TUD file(s) first: ${result.missing_tud_labels.join(", ")}.`;
  }
  if (result.nest_inputs_complete) return null;
  return `Nest inputs incomplete - missing: ${result.missing_nest_input_labels.join(", ")}.`;
}

/** Shop TUKAmrk + legacy nest / plotter export extensions. */
export const MARKER_UPLOAD_ACCEPT =
  ".tum,.TUM,.mrk,.MRK,.plt,.PLT,.pdf,.PDF,.dxf,.DXF,.zip,.ZIP";
