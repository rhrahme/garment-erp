import path from "path";
import {
  readJsonFile,
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import type { StitchAttendanceFile } from "@/lib/types/stitch-attendance";

const STORE_PATH = path.join(process.cwd(), "src/data/stitch-attendance.json");
const EMPTY: StitchAttendanceFile = { updated_at: null, check_ins: [] };

export function readStitchAttendance(): StitchAttendanceFile {
  return normalize(readJsonFile(STORE_PATH, EMPTY));
}

export async function readStitchAttendanceAsync(): Promise<StitchAttendanceFile> {
  return normalize(await readJsonFileAsync(STORE_PATH, EMPTY));
}

export async function readStitchAttendanceFresh(): Promise<StitchAttendanceFile> {
  return normalize(await readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true }));
}

export async function writeStitchAttendance(
  store: StitchAttendanceFile
): Promise<StitchAttendanceFile> {
  const next = normalize({
    ...store,
    updated_at: new Date().toISOString(),
  });
  await saveDocument(STORE_PATH, next);
  return next;
}

function normalize(store: StitchAttendanceFile | null | undefined): StitchAttendanceFile {
  return {
    updated_at: store?.updated_at ?? null,
    check_ins: Array.isArray(store?.check_ins) ? store.check_ins : [],
  };
}
