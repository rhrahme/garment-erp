import {
  ThreadButtonPhotosReviewPanelClient,
  toThreadButtonPhotoReviewItems,
} from "@/components/dashboard/ThreadButtonPhotosReviewPanelClient";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { listUnacknowledgedThreadButtonPhotos } from "@/lib/production/thread-button-matching";
import { readThreadButtonMatches } from "@/lib/data/thread-button-matches";

export async function ThreadButtonPhotosReviewPanel() {
  await ensureDocumentsLoaded(["thread_button_matches"]);
  const pending = listUnacknowledgedThreadButtonPhotos(15);
  // Also show a few recent acknowledged so the panel is not empty-only after review.
  const recentAcknowledged: typeof pending = [];
  for (const match of readThreadButtonMatches().matches) {
    for (const photo of match.photos ?? []) {
      if (!photo.admin_acknowledged_at) continue;
      recentAcknowledged.push({ match, photo });
    }
  }
  recentAcknowledged.sort((a, b) => b.photo.uploaded_at.localeCompare(a.photo.uploaded_at));

  const combined = [...pending, ...recentAcknowledged.slice(0, 5)].slice(0, 20);
  if (combined.length === 0) return null;

  return (
    <ThreadButtonPhotosReviewPanelClient
      initialItems={toThreadButtonPhotoReviewItems(combined)}
    />
  );
}
