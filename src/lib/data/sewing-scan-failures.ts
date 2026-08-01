import path from "path";
import { readJsonFile, readJsonFileAsync, saveDocument } from "@/lib/data/document-persistence";
import {
  pruneSewingScanFailures,
  SEWING_SCAN_FAILURE_MAX_ROWS,
  SEWING_SCAN_FAILURE_RETENTION_DAYS,
} from "@/lib/production/sewing-scan-failure-build";
import type {
  SewingScanFailure,
  SewingScanFailuresFile,
} from "@/lib/types/sewing-scan-failures";

export {
  pruneSewingScanFailures,
  SEWING_SCAN_FAILURE_MAX_ROWS,
  SEWING_SCAN_FAILURE_RETENTION_DAYS,
};

const STORE_PATH = path.join(process.cwd(), "src/data/sewing-scan-failures.json");
const EMPTY: SewingScanFailuresFile = { updated_at: null, failures: [] };

export function readSewingScanFailures(): SewingScanFailuresFile {
  return readJsonFile(STORE_PATH, EMPTY);
}

export async function readSewingScanFailuresAsync(): Promise<SewingScanFailuresFile> {
  return readJsonFileAsync(STORE_PATH, EMPTY);
}

export async function appendSewingScanFailure(
  failure: SewingScanFailure,
  at = Date.now()
): Promise<SewingScanFailure> {
  const store = await readSewingScanFailuresAsync();
  const failures = pruneSewingScanFailures([failure, ...store.failures], at);
  await saveDocument(STORE_PATH, {
    ...store,
    failures,
    updated_at: new Date(at).toISOString(),
  });
  return failure;
}
