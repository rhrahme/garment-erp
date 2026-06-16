import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { FactoryFloorMapViewer } from "@/components/production/FactoryFloorMapViewer";

export default function FactoryFloorMapPage() {
  return (
    <div>
      <PageHeader
        className="print:hidden"
        title="Factory floor map"
        description="Interactive floor plan with scan pins, or switch to Label map (PDF) to download or print PL machine stickers (PL-1-1 … PL-8-9)."
        action={
          <Link
            href="/production"
            className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            ← Production
          </Link>
        }
      />
      <FactoryFloorMapViewer />
    </div>
  );
}
