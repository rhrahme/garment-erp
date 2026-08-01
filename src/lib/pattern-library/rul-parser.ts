import type { RulMetadata } from "@/lib/types/pattern-library";

/**
 * Light parser for ANSI/AAMA / Accumark-style .rul grade-rule headers.
 * These files usually list sizes only (no geometry). Useful as a size
 * cross-check alongside a DXF sample-size export.
 */
export function parseRulFile(buffer: Buffer): RulMetadata | null {
  const text = buffer.toString("utf8");
  if (!/GRADE\s*RULE|SIZE\s*LIST|ANSI\/AAMA/i.test(text)) {
    return null;
  }

  let grade_rule_table: string | null = null;
  let units: string | null = null;
  let sample_size: string | null = null;
  let sizes: string[] = [];
  let author: string | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const grade = line.match(/^GRADE\s*RULE\s*TABLE\s*:\s*(.+)$/i);
    if (grade?.[1]) {
      grade_rule_table = grade[1].trim();
      continue;
    }
    const unitsMatch = line.match(/^UNITS\s*:\s*(.+)$/i);
    if (unitsMatch?.[1]) {
      units = unitsMatch[1].trim();
      continue;
    }
    const sample = line.match(/^SAMPLE\s*SIZE\s*:\s*(.+)$/i);
    if (sample?.[1]) {
      sample_size = sample[1].trim();
      continue;
    }
    const authorMatch = line.match(/^AUTHOR\s*:\s*(.+)$/i);
    if (authorMatch?.[1]) {
      author = authorMatch[1].trim();
      continue;
    }
    const sizeList = line.match(/^SIZE\s*LIST\s*:\s*(.+)$/i);
    if (sizeList?.[1]) {
      sizes = sizeList[1]
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  if (!sizes.length && sample_size) sizes = [sample_size];
  if (!sizes.length && !grade_rule_table) return null;

  return {
    grade_rule_table,
    units,
    sample_size,
    sizes,
    author,
  };
}
