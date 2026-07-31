import { notFound } from "next/navigation";
import { ClientPhotoPrintView } from "@/components/pattern/library/ClientPhotoPrintView";
import { getSessionContext } from "@/lib/auth/session";
import { canAccessClientMedia } from "@/lib/auth/permissions";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getClientPatternByIdFresh } from "@/lib/data/pattern-library";
import { readSalesWorkspaceFresh } from "@/lib/data/sales-workspace";
import type { ClientPhoto } from "@/lib/types/sales-workspace";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ patternId: string }>;
  searchParams: Promise<{ ids?: string; scope?: string }>;
};

function parseIds(raw: string | undefined): Set<string> | null {
  if (!raw?.trim()) return null;
  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

export default async function ClientPatternPhotosPrintPage({
  params,
  searchParams,
}: PageProps) {
  const { patternId } = await params;
  const { ids, scope } = await searchParams;

  const session = await getSessionContext();
  if (!session.canAccessPattern || !canAccessClientMedia(session)) notFound();

  await ensureDocumentsLoaded(["pattern_library", "clients", "sales_workspace"]);
  const pattern = await getClientPatternByIdFresh(patternId);
  if (!pattern) notFound();

  const workspace = await readSalesWorkspaceFresh();
  const details = workspace.client_details.find(
    (entry) => entry.client_id === pattern.client_id
  );
  const allPhotos: ClientPhoto[] = details?.photos ?? [];
  const selectedIds = parseIds(ids);

  let photos: ClientPhoto[];
  if (selectedIds) {
    photos = allPhotos.filter((photo) => selectedIds.has(photo.id));
  } else if (scope === "all") {
    photos = allPhotos;
  } else {
    // Default: photos assigned to this pattern sheet (or its linked fabric lines).
    const linked = new Set(pattern.linked_fabric_line_ids ?? []);
    photos = allPhotos.filter(
      (photo) =>
        photo.assigned_client_pattern_id === patternId ||
        (photo.assigned_fabric_line_id != null &&
          linked.has(photo.assigned_fabric_line_id))
    );
  }

  return (
    <ClientPhotoPrintView
      patternId={pattern.id}
      patternRef={pattern.pattern_ref}
      clientName={pattern.client_name || null}
      photos={photos}
    />
  );
}
