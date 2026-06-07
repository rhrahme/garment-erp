import { LabelPrinterTest } from "@/components/orders/LabelPrinterTest";
import { PageHeader } from "@/components/ui/PageHeader";

export default function LabelPrinterTestPage() {
  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Sticker printer test"
          description="10 × 5 cm roll — calibrate AIMO / LabelLife media, then print one test label"
        />
      </div>
      <LabelPrinterTest />
    </div>
  );
}
