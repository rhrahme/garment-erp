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
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Blank labels from the browser print dialog?</p>
          <p className="mt-1">
            Use <strong>Download PDF</strong> → open in <strong>Preview.app</strong> → File → Print. That path
            always works on macOS when Chrome or Safari sends a blank page to the thermal printer.
          </p>
        </div>
      </div>
      <LabelPrinterTest />
    </div>
  );
}
