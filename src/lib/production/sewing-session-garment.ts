import { resolveScanToLine } from "@/lib/production/stage-scan";
import { pieceScanAttribution } from "@/lib/sales-orders/label-codes";
import type { SewingSession } from "@/lib/types/sewing-sessions";

export { sewingSessionArticleLabel } from "@/lib/production/sewing-session-article-label";

/** Backfill null garment_type / fabric_number / supplier_id from the live SO sticker lookup. */
export function enrichSewingSessionGarmentFields(session: SewingSession): SewingSession {
  const needsType = !session.garment_type?.trim();
  const needsFabric = !session.fabric_number?.trim();
  const needsSupplier = !session.supplier_id?.trim();
  if (!needsType && !needsFabric && !needsSupplier) return session;

  const codes = [session.scan_code, session.production_code]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const code of codes) {
    const lookup = resolveScanToLine(code);
    if (!lookup) continue;
    const siblings = lookup.line.label_stickers ?? [lookup.sticker];
    const attribution = pieceScanAttribution(lookup.sticker, lookup.order.client_code, siblings);
    return {
      ...session,
      garment_type: needsType
        ? lookup.line.garment_type?.trim() || attribution.piece_name?.trim() || null
        : session.garment_type,
      fabric_number: needsFabric
        ? lookup.line.fabric_number?.trim() || null
        : session.fabric_number,
      supplier_id: needsSupplier
        ? lookup.line.supplier_id?.trim() || null
        : session.supplier_id,
      piece_mark: session.piece_mark?.trim() || attribution.piece_mark || null,
    };
  }

  return session;
}

export function enrichSewingSessionsGarmentFields(sessions: SewingSession[]): SewingSession[] {
  const cache = new Map<string, SewingSession>();
  return sessions.map((session) => {
    const key = `${session.id}|${session.scan_code}|${session.production_code}|${session.garment_type ?? ""}|${session.fabric_number ?? ""}|${session.supplier_id ?? ""}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const enriched = enrichSewingSessionGarmentFields(session);
    cache.set(key, enriched);
    return enriched;
  });
}
