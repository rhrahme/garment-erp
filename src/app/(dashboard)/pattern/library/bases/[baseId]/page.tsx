import { BasePatternDetail } from "@/components/pattern/library/BasePatternDetail";
import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import { getFactoryBrands } from "@/lib/data/factory-brands";

export default async function BasePatternPage({
  params,
}: {
  params: Promise<{ baseId: string }>;
}) {
  const { baseId } = await params;
  const brands = getFactoryBrands()
    .filter((brand) => brand.is_active)
    .map((brand) => ({
      id: brand.id,
      code: getBrandClientCodePrefix(brand.id) ?? brand.code,
      name: brand.name,
    }));
  return <BasePatternDetail baseId={baseId} brands={brands} />;
}
