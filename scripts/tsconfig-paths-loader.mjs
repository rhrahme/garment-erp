import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const candidates = [
      path.join(SRC, rel),
      path.join(SRC, `${rel}.ts`),
      path.join(SRC, `${rel}.tsx`),
      path.join(SRC, `${rel}.json`),
      path.join(SRC, rel, "index.ts"),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        return nextResolve(pathToFileURL(file).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
