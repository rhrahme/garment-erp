import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

function resolveCandidates(base, context, nextResolve) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.json`,
    path.join(base, "index.ts"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const url = pathToFileURL(file).href;
      if (file.endsWith(".json")) {
        return {
          shortCircuit: true,
          url,
          format: "json",
          importAttributes: { type: "json" },
        };
      }
      return nextResolve(url, context);
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = resolveCandidates(path.join(SRC, specifier.slice(2)), context, nextResolve);
    if (resolved) return resolved;
  }

  // Relative extensionless TS imports (e.g. "./zapier" inside src/) — ESM
  // requires extensions, so probe .ts/.tsx/index.ts like the "@/" branch.
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !path.extname(specifier) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const resolved = resolveCandidates(path.resolve(parentDir, specifier), context, nextResolve);
    if (resolved) return resolved;
  }

  // "next/server" has no ESM exports entry - map bare next/* subpaths to
  // their .js files so tests can import modules that touch next APIs.
  if (specifier.startsWith("next/") && !path.extname(specifier)) {
    const candidate = path.join(ROOT, "node_modules", `${specifier}.js`);
    if (fs.existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context);
    }
  }

  return nextResolve(specifier, context);
}
