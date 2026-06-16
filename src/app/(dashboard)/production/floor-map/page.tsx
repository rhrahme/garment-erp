import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { FactoryFloorMapViewer } from "@/components/production/FactoryFloorMapViewer";

export default function FactoryFloorMapPage() {
  return (
    <div>
      <PageHeader
        title="Factory floor map"
        description="Hagan layout with scan station pins and PL machine labels (PL-1-1 … PL-8-9)."
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
