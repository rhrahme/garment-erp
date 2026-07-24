import { ClientPatternDetail } from "@/components/pattern/library/ClientPatternDetail";

export default async function ClientPatternPage({
  params,
}: {
  params: Promise<{ patternId: string }>;
}) {
  const { patternId } = await params;
  return <ClientPatternDetail patternId={patternId} />;
}
