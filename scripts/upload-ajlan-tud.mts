/**
 * One-off: create the Abdul Aziz (Ajlan Mohamad Al Ajlan) linen-shirt client
 * pattern in the LIVE app data and upload his real TUKA .tud file, running the
 * exact same code paths the deployed API routes use (createClientPattern →
 * storeLibraryUpload → attachClientPatternFile → webhook notify).
 *
 * .env.local points at the production Supabase, so document-persistence and
 * file-storage write straight to live erp_documents + erp-pattern-files.
 */
import fs from "node:fs";
import path from "node:path";

// Load .env.local before importing any app module (imports below are dynamic).
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2];
  }
}

const TUD_PATH = "/Users/ralphrahme/Downloads/Abdul Aziz Aljan Al Ajlan Linen  20.07.26.tud";

const { isSupabaseDocumentsStorage } = await import("../src/lib/data/document-persistence");
const { readPatternLibraryFresh } = await import("../src/lib/data/pattern-library");
const { createClientPattern, attachClientPatternFile } = await import(
  "../src/lib/pattern-library/mutations"
);
const { storeLibraryUpload, notifyLibraryFileUploaded, tudNotificationFields } = await import(
  "../src/lib/pattern-library/upload"
);

if (!isSupabaseDocumentsStorage()) {
  throw new Error("Supabase documents storage is NOT active — aborting (would write local JSON only).");
}
console.log("Supabase documents storage active — writes go to LIVE data.\n");

const UPLOADED_BY = "info@hagan.pro";

// Idempotency: reuse an existing pattern for this client+garment if present.
const store = await readPatternLibraryFresh();
let pattern = store.client_patterns.find(
  (p) => p.client_code === "FR-0626-0035" && p.garment_type === "shirt"
);

if (pattern) {
  console.log(`Existing client pattern found: ${pattern.id} (${pattern.pattern_ref}) — reusing.`);
} else {
  const created = await createClientPattern(
    {
      client_id: "new-1781348265572",
      client_code: "FR-0626-0035",
      client_name: "Ajlan Mohamad Al Ajlan",
      garment_type: "shirt",
      description: "Linen shirt — size 2XL (XXL). TUKA CAD pattern from client file (SO-2026-0122).",
      base_pattern_id: "bp-fr-suit-supply-shirt-regular",
      base_size: null,
      fabric: "Linen — Loro Piana 722042",
      pattern_ref: "SS-SHIRT-LINEN-FR-REG-XXL",
      notes: "Pattern file received from client 20.07.26. Linked to SO-2026-0122 Shirt LS lines (Loro Piana 722042).",
    },
    { createdBy: UPLOADED_BY }
  );
  if (!created.ok) throw new Error(`createClientPattern failed: ${created.error}`);
  pattern = created.pattern;
  console.log(`Created client pattern: ${pattern.id} (${pattern.pattern_ref})`);
}

// Skip re-upload if this exact filename is already attached.
const filename = path.basename(TUD_PATH);
const already = pattern.files.find((f) => f.filename === filename);
if (already) {
  console.log(`File already attached (${already.id}) — nothing to upload.`);
  console.log(JSON.stringify(already, null, 2));
  process.exit(0);
}

const buffer = fs.readFileSync(TUD_PATH);
const file = new File([buffer], filename, { type: "application/octet-stream" });
const stored = await storeLibraryUpload(file, pattern.id, UPLOADED_BY);
if (!stored.ok) throw new Error(`storeLibraryUpload failed: ${stored.error}`);
console.log("\nStored upload (parsed .tud):");
console.log(JSON.stringify(stored.attachment, null, 2));

const attached = await attachClientPatternFile(pattern.id, null, stored.attachment);
if (!attached.ok) throw new Error(`attachClientPatternFile failed: ${attached.error}`);

await notifyLibraryFileUploaded({
  client_pattern_id: pattern.id,
  version_id: null,
  file_id: stored.attachment.id,
  filename: stored.attachment.filename,
  kind: stored.attachment.kind,
  uploaded_by: UPLOADED_BY,
  ...tudNotificationFields(stored.attachment),
});

console.log(`\nDone. Pattern ${pattern.id} — view at https://erp.hagan.pro/pattern/library/clients/${pattern.id}`);
