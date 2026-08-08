import { notFound } from "next/navigation";
import { PatternSheetPrintView } from "@/components/pattern/library/PatternSheetPrintView";
import { getSessionContext } from "@/lib/auth/session";
import {
  parsePatternSheetKind,
  parsePatternSheetLineIds,
} from "@/lib/pattern-library/pattern-sheet-kind";
import { buildPatternSheetData } from "@/lib/pattern-library/sheet-data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ patternId: string }>;
  searchParams: Promise<{ version?: string; job?: string; sheet?: string; lines?: string }>;
};

export default async function ClientPatternPrintPage({ params, searchParams }: PageProps) {
  const { patternId } = await params;
  const { version, job, sheet, lines } = await searchParams;

  const session = await getSessionContext();
  if (!session.canAccessPattern) notFound();

  const kind = parsePatternSheetKind(sheet);
  const lineIds = parsePatternSheetLineIds(lines);

  const data = await buildPatternSheetData(patternId, {
    versionId: version ?? null,
    jobId: job ?? null,
    // Sewing pack: honor tick selection. Other sheets keep all linked articles
    // available but still use the classic primary fabric/sticker resolution.
    // Missing/empty lines = all linked articles (preview defaults).
    lineIds: kind === "sewing" ? (lineIds && lineIds.length > 0 ? lineIds : null) : null,
  });
  if (!data) notFound();

  return <PatternSheetPrintView data={data} kind={kind} />;
}
