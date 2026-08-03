import { displayNameForEmail } from "@/lib/auth/user-display";
import type { SupplierFabric } from "@/lib/types/fabric-sourcing";

/** Custom fabrics created within this window get the orange "New" treatment. */
export const RECENT_CUSTOM_FABRIC_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

type RecentFabricFields = Pick<SupplierFabric, "kind" | "created_at" | "created_by">;

/**
 * True for custom / one-off fabrics created within the highlight window.
 * Catalog (mill price-list) fabrics never qualify, even if they carry a
 * created_at, so the orange tint stays scoped to one-off additions.
 */
export function isRecentlyAddedCustomFabric(
  fabric: RecentFabricFields,
  now: Date = new Date(),
  windowDays: number = RECENT_CUSTOM_FABRIC_WINDOW_DAYS
): boolean {
  if (fabric.kind !== "custom" || !fabric.created_at) return false;
  const created = new Date(fabric.created_at).getTime();
  if (!Number.isFinite(created)) return false;
  const age = now.getTime() - created;
  // Small negative ages (clock skew between server and client) still count.
  return age <= windowDays * DAY_MS;
}

/**
 * Badge label for a recently added custom fabric: "QC Hossein - 3 Aug".
 * Falls back to the raw email when no display name is mapped, and to just
 * the date when the fabric predates created_by capture.
 */
export function recentCustomFabricAddedLabel(fabric: RecentFabricFields): string | null {
  if (!fabric.created_at) return null;
  const created = new Date(fabric.created_at);
  if (!Number.isFinite(created.getTime())) return null;
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(created);
  const who = fabric.created_by ? displayNameForEmail(fabric.created_by) ?? fabric.created_by : null;
  return who ? `${who} - ${date}` : `Added ${date}`;
}
