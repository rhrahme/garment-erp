import path from "path";
import {
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import type {
  QualityInspectionRecord,
  QualityInspectionsFile,
} from "@/lib/types/quality";

const STORE_PATH = path.join(process.cwd(), "src/data/quality-inspections.json");
const EMPTY: QualityInspectionsFile = { updated_at: null, inspections: [] };

export async function readQualityInspectionsAsync(): Promise<QualityInspectionsFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY);
}

async function writeQualityInspections(
  data: QualityInspectionsFile
): Promise<QualityInspectionsFile> {
  const payload: QualityInspectionsFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(STORE_PATH, payload);
}

export async function listQualityInspectionsAsync(
  limit = 200
): Promise<QualityInspectionRecord[]> {
  const store = await readQualityInspectionsAsync();
  return [...store.inspections]
    .sort((a, b) => b.inspection_date.localeCompare(a.inspection_date))
    .slice(0, limit);
}

export async function appendQualityInspection(
  inspection: QualityInspectionRecord
): Promise<QualityInspectionRecord> {
  const store = structuredClone(
    await readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true })
  );
  store.inspections.unshift(inspection);
  await writeQualityInspections(store);
  return inspection;
}
