import type { FabricSwatchKey } from "@/lib/fabric-sourcing/fabric-swatch-keys";
import type { SewingSession } from "@/lib/types/sewing-sessions";

export function sewingSessionSwatchKey(
  session: Pick<SewingSession, "supplier_id" | "fabric_number">
): FabricSwatchKey | null {
  const fabric_number = session.fabric_number?.trim() ?? "";
  const supplier_id = session.supplier_id?.trim() ?? "";
  if (!fabric_number || !supplier_id) return null;
  return { supplier_id, fabric_number };
}

export function collectSewingSessionSwatchKeys(
  sessions: Iterable<Pick<SewingSession, "supplier_id" | "fabric_number">>
): FabricSwatchKey[] {
  const seen = new Set<string>();
  const keys: FabricSwatchKey[] = [];
  for (const session of sessions) {
    const key = sewingSessionSwatchKey(session);
    if (!key) continue;
    const id = `${key.supplier_id}::${key.fabric_number}`;
    if (seen.has(id)) continue;
    seen.add(id);
    keys.push(key);
  }
  return keys;
}
