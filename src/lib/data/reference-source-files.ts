import fs from "fs";
import path from "path";

interface ReferenceSourceManifestEntry {
  id: string;
  filename: string;
  relative_path: string;
}

interface ReferenceSourceManifest {
  files?: ReferenceSourceManifestEntry[];
}

function loadManifest(): ReferenceSourceManifest {
  const manifestPath = path.join(process.cwd(), "src/data/reference-source-files.json");
  if (!fs.existsSync(manifestPath)) return { files: [] };
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ReferenceSourceManifest;
}

export function getReferenceSourceFileById(id: string): {
  filename: string;
  absolutePath: string;
} | null {
  const entry = loadManifest().files?.find((file) => file.id === id);
  if (!entry) return null;
  const absolutePath = path.join(process.cwd(), entry.relative_path);
  if (!fs.existsSync(absolutePath)) return null;
  return { filename: entry.filename, absolutePath };
}

export function contentTypeForReferenceFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  return "application/octet-stream";
}
