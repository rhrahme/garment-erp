import { Suspense } from "react";
import { ClientPatternDetail } from "@/components/pattern/library/ClientPatternDetail";

export default async function ClientPatternPage({
  params,
}: {
  params: Promise<{ patternId: string }>;
}) {
  const { patternId } = await params;
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading client pattern...</p>}>
      <ClientPatternDetail patternId={patternId} />
    </Suspense>
  );
}
