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
          <p className="font-semibold">Blank labels on the D550?</p>
          <p className="mt-1">
            PDFs are now full-page bitmaps. If still blank, use <strong>Download PNG</strong> → Preview.app →
            Print at <strong>100% scale</strong> on <strong>51×102 mm</strong> media.
          </p>
        </div>
      </div>
      <LabelPrinterTest />
    </div>
  );
}
