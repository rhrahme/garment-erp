import fs from "fs";
import path from "path";

type CacheEntry = {
  mtimeMs: number;
  data: unknown;
};

const cache = new Map<string, CacheEntry>();

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const stat = fs.statSync(filePath);
    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.data as T;
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
    cache.set(filePath, { mtimeMs: stat.mtimeMs, data });
    return data;
  } catch {
    return fallback;
  }
}

export function writeJsonFile<T>(filePath: string, data: T): T {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  const stat = fs.statSync(filePath);
  cache.set(filePath, { mtimeMs: stat.mtimeMs, data });
  return data;
}
