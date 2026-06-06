import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { FactoryFloorMapViewer } from "@/components/production/FactoryFloorMapViewer";

export default function FactoryFloorMapPage() {
  return (
    <div>
      <PageHeader
        title="Factory floor map"
        description="Hagan layout with scan station pins — colours match Fabric Receiving and Production."
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
