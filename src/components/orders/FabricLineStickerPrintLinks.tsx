import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { orderStickerSheetHref } from "@/lib/orders/sticker-print-links";
import { getGarmentPieces } from "@/lib/sales-orders/label-codes";

export function FabricLineStickerPrintLinks({
  orderId,
  lineId,
  garmentType,
  stickerCount,
  showCutting = true,
  size = "sm",
}: {
  orderId: string;
  lineId: string;
  garmentType: string;
  /** When set, overrides garment-type piece count for cutting sticker visibility. */
  stickerCount?: number;
  showCutting?: boolean;
  size?: "sm" | "default";
}) {
  const pieceCount = stickerCount ?? getGarmentPieces(garmentType).length;
  const multiPiece = pieceCount > 1;

  return (
    <div className="flex flex-wrap gap-1.5">
      <Link href={orderStickerSheetHref(orderId, "fabric-cuts", { lineId })} target="_blank" rel="noreferrer">
        <Button size={size} variant="secondary">
          Fabric sticker
        </Button>
      </Link>
      {showCutting && multiPiece ? (
        <Link href={orderStickerSheetHref(orderId, "pieces", { lineId })} target="_blank" rel="noreferrer">
          <Button size={size} variant="secondary">
            Cutting stickers
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
