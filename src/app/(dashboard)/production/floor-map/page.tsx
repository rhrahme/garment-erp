import { PageHeader } from "@/components/ui/PageHeader";
import { FactoryFloorMapViewer } from "@/components/production/FactoryFloorMapViewer";

export default function FactoryFloorMapPage() {
  return (
    <div>
      <PageHeader
        className="print:hidden"
        title="Factory floor map"
        description="Hagan layout — interactive scan pins, machine label stickers (PL-1-1 … PL-8-9), and printable workstation detail cards."
      />
      <FactoryFloorMapViewer />
    </div>
  );
}
