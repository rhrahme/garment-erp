import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Resolve @/ alias and append .ts for extensionless relative imports. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const candidates = [
      path.join(ROOT, "src", `${rel}.ts`),
      path.join(ROOT, "src", rel, "index.ts"),
      path.join(ROOT, "src", rel),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }

  if (specifier.startsWith(".") && !specifier.endsWith(".ts") && !specifier.endsWith(".json")) {
    const parent = path.dirname(fileURLToPath(context.parentURL));
    const tsPath = path.resolve(parent, `${specifier}.ts`);
    if (fs.existsSync(tsPath)) {
      return nextResolve(pathToFileURL(tsPath).href, context);
    }
  }

  return nextResolve(specifier, context);
}
