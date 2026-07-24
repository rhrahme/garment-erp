import { notifyIntegration } from "@/lib/integrations";
import {
  PATTERN_LIBRARY_MAX_FILE_BYTES,
  classifyPatternLibraryFile,
  writePatternLibraryFile,
} from "@/lib/pattern-library/file-storage";
import type { PatternLibraryAttachment } from "@/lib/types/pattern-library";

/** Stores the uploaded bytes and returns attachment metadata (caller persists it). */
export async function storeLibraryUpload(
  file: File,
  ownerPrefix: string,
  uploadedBy: string | null
): Promise<{ ok: true; attachment: PatternLibraryAttachment } | { ok: false; error: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) return { ok: false, error: "File is empty." };
  if (buffer.length > PATTERN_LIBRARY_MAX_FILE_BYTES) {
    return { ok: false, error: "File exceeds the 50MB limit." };
  }

  const { kind, contentType } = classifyPatternLibraryFile(file.name);
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFilename = `${ownerPrefix}-${Date.now()}-${sanitized}`;
  await writePatternLibraryFile(storedFilename, buffer, contentType);

  return {
    ok: true,
    attachment: {
      id: `plf-${Date.now()}`,
      kind,
      filename: file.name,
      stored_filename: storedFilename,
      content_type: contentType,
      size_bytes: buffer.length,
      uploaded_at: new Date().toISOString(),
      uploaded_by: uploadedBy,
    },
  };
}

export async function notifyLibraryFileUploaded(data: Record<string, unknown>): Promise<void> {
  await notifyIntegration("pattern_library.file_uploaded", data);
}
