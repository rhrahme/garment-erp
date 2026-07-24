import { BasePatternDetail } from "@/components/pattern/library/BasePatternDetail";

export default async function BasePatternPage({
  params,
}: {
  params: Promise<{ baseId: string }>;
}) {
  const { baseId } = await params;
  return <BasePatternDetail baseId={baseId} />;
}
