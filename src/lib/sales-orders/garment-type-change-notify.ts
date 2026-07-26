import { readGarmentTypeChangesFreshAsync, writeGarmentTypeChanges } from "@/lib/data/garment-type-changes";

export async function markGarmentTypeChangeAdminNotified(changeId: string): Promise<void> {
  const store = structuredClone(await readGarmentTypeChangesFreshAsync());
  const index = store.changes.findIndex((change) => change.id === changeId);
  if (index < 0) return;

  store.changes[index] = {
    ...store.changes[index]!,
    admin_notified_at: new Date().toISOString(),
  };
  await writeGarmentTypeChanges(store);
}
