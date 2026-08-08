import { PageHeader } from "@/components/ui/PageHeader";
import { PatternLibraryWorkspace } from "@/components/pattern/library/PatternLibraryWorkspace";
import { PatternMeasurementUnitControl } from "@/components/pattern/library/PatternMeasurementUnitControl";
import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import { getFactoryBrands } from "@/lib/data/factory-brands";

export default function PatternLibraryPage() {
  const brands = getFactoryBrands()
    .filter((brand) => brand.is_active)
    .map((brand) => ({
      id: brand.id,
      code: getBrandClientCodePrefix(brand.id) ?? brand.code,
      name: brand.name,
    }));

  return (
    <div>
      <PageHeader
        title="Pattern Library"
        description="Digitized base patterns per house brand and cut family, plus client patterns derived from them — replaces the Excel measurement sheets."
        action={<PatternMeasurementUnitControl />}
      />
      <PatternLibraryWorkspace brands={brands} />
    </div>
  );
}
