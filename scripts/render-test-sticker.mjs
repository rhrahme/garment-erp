import fs from "node:fs";
import path from "node:path";
import { generateTestStickerPdf } from "@/lib/production/generate-sticker-pdf";

const rotation = Number.parseInt(process.argv[2] ?? "0", 10);
const scale = Number.parseInt(process.argv[3] ?? "100", 10);
const outPath = path.join(process.cwd(), "sticker-test-verify.pdf");

const bytes = await generateTestStickerPdf({ rotationDeg: rotation, scalePct: scale });
fs.writeFileSync(outPath, Buffer.from(bytes));
console.log(`Wrote ${outPath} (${bytes.length} bytes) rotation=${rotation} scale=${scale}`);
