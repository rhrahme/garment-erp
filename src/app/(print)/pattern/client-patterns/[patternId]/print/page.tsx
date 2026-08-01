import { notFound } from "next/navigation";
import { PatternSheetPrintView } from "@/components/pattern/library/PatternSheetPrintView";
import { getSessionContext } from "@/lib/auth/session";
import { parsePatternSheetKind } from "@/lib/pattern-library/pattern-sheet-kind";
import { buildPatternSheetData } from "@/lib/pattern-library/sheet-data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ patternId: string }>;
  searchParams: Promise<{ version?: string; job?: string; sheet?: string }>;
};

export default async function ClientPatternPrintPage({ params, searchParams }: PageProps) {
  const { patternId } = await params;
  const { version, job, sheet } = await searchParams;

  const session = await getSessionContext();
  if (!session.canAccessPattern) notFound();

  const data = await buildPatternSheetData(patternId, {
    versionId: version ?? null,
    jobId: job ?? null,
  });
  if (!data) notFound();

  return <PatternSheetPrintView data={data} kind={parsePatternSheetKind(sheet)} />;
}
