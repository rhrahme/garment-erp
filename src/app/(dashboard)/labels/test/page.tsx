import { LabelPrinterTest } from "@/components/orders/LabelPrinterTest";
import { PageHeader } from "@/components/ui/PageHeader";
import { labelRollSizeLabel } from "@/lib/production/label-print-config";

export default function LabelPrinterTestPage() {
  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Sticker printer test"
          description={`${labelRollSizeLabel()} roll — calibrate AIMO / LabelLife media, then print one test label`}
        />
      </div>
      <LabelPrinterTest />
    </div>
  );
}
