import {
  scanStageStyles,
  type ScanHighlightStage,
} from "@/lib/production/scan-stage-highlight";

/**
 * Read-only fabric status chip for Pattern views (arrived / washing /
 * cutting ...). Pure display - Pattern cannot act on the receiving floor.
 */
export function FabricStatusPill({ stage }: { stage: ScanHighlightStage | undefined }) {
  if (!stage) return null;
  const styles = scanStageStyles(stage);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${styles.chip}`}
      title="Fabric status (view only)"
    >
      {styles.label}
    </span>
  );
}
