import { isMultiPieceGarment } from "@/lib/sales-orders/label-codes";

/** Nested Jacket / Trouser (etc.) under a multi-piece parent garment line. */
export function GarmentPiecesNest({
  garmentType,
  pieces,
  className = "mt-1 space-y-0.5 text-sm text-slate-600",
}: {
  garmentType: string;
  pieces: string[];
  className?: string;
}) {
  if (!isMultiPieceGarment(garmentType) || pieces.length <= 1) return null;

  return (
    <ul className={className}>
      {pieces.map((piece) => (
        <li key={piece} className="flex gap-1.5">
          <span className="select-none text-slate-400" aria-hidden>
            -
          </span>
          <span>{piece}</span>
        </li>
      ))}
    </ul>
  );
}
