import path from "path";
import {
  readJsonFile,
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
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

export async function readSewingScanFailuresFresh(): Promise<SewingScanFailuresFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true });
}

export async function writeSewingScanFailures(
  store: SewingScanFailuresFile,
  options: { allowTestingReset?: boolean } = {}
): Promise<SewingScanFailuresFile> {
  const next = {
    ...store,
    updated_at: new Date().toISOString(),
    ...(options.allowTestingReset ? { allow_testing_reset: true } : {}),
  };
  await saveDocument(STORE_PATH, next);
  const { allow_testing_reset: _flag, ...clean } = next as SewingScanFailuresFile & {
    allow_testing_reset?: boolean;
  };
  return clean;
}

export async function appendSewingScanFailure(
  failure: SewingScanFailure,
  at = Date.now()
): Promise<SewingScanFailure> {
  const store = await readSewingScanFailuresFresh();
  const failures = pruneSewingScanFailures([failure, ...store.failures], at);
  await writeSewingScanFailures({
    ...store,
    failures,
  });
  return failure;
}
