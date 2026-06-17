import path from "path";
import {
  ensureDocumentsLoaded,
  readJsonFile,
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import type { PatternJob, PatternJobsFile } from "@/lib/types/pattern";

const PATTERN_JOBS_PATH = path.join(process.cwd(), "src/data/pattern-jobs.json");

const EMPTY: PatternJobsFile = { updated_at: null, jobs: [] };

export function readPatternJobs(): PatternJobsFile {
  return readJsonFile(PATTERN_JOBS_PATH, EMPTY);
}

export async function readPatternJobsAsync(): Promise<PatternJobsFile> {
  return readJsonFileAsync(PATTERN_JOBS_PATH, EMPTY);
}

export async function readPatternJobsFresh(): Promise<PatternJobsFile> {
  return readJsonFileFreshAsync(PATTERN_JOBS_PATH, EMPTY);
}

export async function writePatternJobs(data: PatternJobsFile): Promise<PatternJobsFile> {
  const next: PatternJobsFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(PATTERN_JOBS_PATH, next);
}

export async function ensurePatternDocumentsLoaded(): Promise<void> {
  await ensureDocumentsLoaded(["pattern_jobs", "sales_orders"]);
}

export function getPatternJobById(id: string): PatternJob | null {
  const store = readPatternJobs();
  return store.jobs.find((job) => job.id === id) ?? null;
}

export async function getPatternJobByIdFresh(id: string): Promise<PatternJob | null> {
  const store = await readPatternJobsFresh();
  return store.jobs.find((job) => job.id === id) ?? null;
}

export function listPatternJobsForOrder(salesOrderId: string): PatternJob[] {
  const store = readPatternJobs();
  return store.jobs.filter((job) => job.sales_order_id === salesOrderId);
}
