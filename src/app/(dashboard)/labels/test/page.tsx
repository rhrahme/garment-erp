import { LabelPrinterTest } from "@/components/orders/LabelPrinterTest";
import { PageHeader } from "@/components/ui/PageHeader";
import { labelRollSizeLabel } from "@/lib/production/label-print-config";

export default function LabelPrinterTestPage() {
  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Label printer settings"
          description={`${labelRollSizeLabel()} roll — set label rotation, calibrate AIMO / LabelLife media, then print a test label`}
        />
      </div>
      <LabelPrinterTest />
    </div>
  );
}
