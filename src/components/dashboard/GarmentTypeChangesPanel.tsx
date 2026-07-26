import { GarmentTypeChangesPanelClient } from "@/components/dashboard/GarmentTypeChangesPanelClient";
import { listGarmentTypeChanges } from "@/lib/data/garment-type-changes";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export async function GarmentTypeChangesPanel() {
  await ensureDocumentsLoaded(["garment_type_changes"]);
  const changes = listGarmentTypeChanges(15);

  if (changes.length === 0) {
    return null;
  }

  return (
    <GarmentTypeChangesPanelClient initialChanges={changes} />
  );
}
