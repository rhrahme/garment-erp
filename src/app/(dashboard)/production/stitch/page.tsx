import { PageHeader } from "@/components/ui/PageHeader";
import { StitchKioskPanel } from "@/components/production/StitchKioskPanel";

export default function ProductionStitchKioskPage() {
  return (
    <div>
      <PageHeader
        title="Stitch kiosk"
        description="Factory laptop next to stitchers: badge ? A4 start ? A4 end ? badge. Timed sewing + stage advance."
      />
      <StitchKioskPanel />
    </div>
  );
}
