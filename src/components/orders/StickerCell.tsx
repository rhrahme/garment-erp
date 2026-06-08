"use client";

import {
  LABEL_STICKER_BATCH_GAP_MM,
  LABEL_STICKER_LINE_GAP_MM,
  LABEL_STICKER_PADDING_H_MM,
  LABEL_STICKER_PADDING_V_MM,
  LABEL_STICKER_QR_SIZE_MM,
  labelRollHeightMm,
  labelRollWidthMm,
} from "@/lib/production/label-print-config";
import {
  formatStickerBatchMark,
  formatStickerCutLength,
  formatStickerLabelsSent,
  qrImageUrl,
  resolveStickerRole,
  STICKER_ROLE_LABEL,
} from "@/lib/production/qr-labels";
import type { StickerRole } from "@/lib/production/qr-labels";
import type { PrintableStickerLabel } from "@/lib/production/qr-labels";
import { stickerTextLine } from "@/lib/production/sticker-typography";

const qrFlankStyle = stickerTextLine({
  fontSize: "2mm",
  letterSpacing: "0.02mm",
  lineHeight: 1.1,
  whiteSpace: "nowrap",
  flexShrink: 0,
});

function formatWeight(weightGsm: number | null): string | null {
  if (weightGsm == null) return null;
  return `${weightGsm} gsm`;
}

/** One 10 × 5 cm roll label — light sans type for thermal printers. */
export function StickerCell({
  label,
  role,
  onQrReady,
}: {
  label: PrintableStickerLabel & { qr_url?: string };
  /** Receive fabric-cut → PREPARATION; piece / cutting → PRODUCTION. Inferred when omitted. */
  role?: StickerRole;
  onQrReady?: () => void;
}) {
  const qrUrl = qrImageUrl(label.qr_payload, 140);
  const weight = formatWeight(label.weight_gsm);
  const pieceLabel =
    label.production_code === label.fabric_cut_code
      ? `Cut · ${label.piece_name}`
      : label.piece_name;
  const fabricLine = `${label.fabric_brand} / ${label.fabric_number}`;
  const specLine = [label.composition, weight].filter(Boolean).join(" / ");
  const cutLengthLine = formatStickerCutLength(label.cut_quantity, label.cut_unit);
  const labelsLine = formatStickerLabelsSent(label.labels_sent);
  const batchMark = formatStickerBatchMark(label);
  const stickerRole = resolveStickerRole(label, role);

  return (
    <div
      className="sticker-cell border border-dashed border-slate-300 bg-white print:border-0"
      style={{
        width: `${labelRollWidthMm()}mm`,
        height: `${labelRollHeightMm()}mm`,
        boxSizing: "border-box",
        padding: `${LABEL_STICKER_PADDING_V_MM}mm ${LABEL_STICKER_PADDING_H_MM}mm`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        textAlign: "center",
      }}
    >
      <div
        className="sticker-cell-body"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: `${LABEL_STICKER_LINE_GAP_MM}mm`,
          width: "100%",
          maxHeight: "100%",
        }}
      >
        <div
          className="sticker-qr-row"
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            columnGap: `${LABEL_STICKER_BATCH_GAP_MM}mm`,
            minHeight: `${LABEL_STICKER_QR_SIZE_MM}mm`,
            flexShrink: 0,
          }}
        >
          <span
            className="sticker-role-mark"
            style={{
              ...qrFlankStyle,
              justifySelf: "end",
              textAlign: "right",
            }}
          >
            {STICKER_ROLE_LABEL[stickerRole]}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt=""
            onLoad={onQrReady}
            onError={onQrReady}
            style={{
              width: `${LABEL_STICKER_QR_SIZE_MM}mm`,
              height: `${LABEL_STICKER_QR_SIZE_MM}mm`,
              flexShrink: 0,
              display: "block",
              justifySelf: "center",
            }}
          />
          <span
            className="sticker-batch-mark"
            style={{
              ...qrFlankStyle,
              justifySelf: "start",
              textAlign: "left",
              fontVariantNumeric: "tabular-nums",
              visibility: batchMark ? "visible" : "hidden",
            }}
          >
            {batchMark ?? "\u00a0"}
          </span>
        </div>

        <p
          className="sticker-line sticker-line-client"
          style={stickerTextLine({
            fontSize: "2.35mm",
            letterSpacing: "0.04mm",
            fontVariantNumeric: "tabular-nums",
          })}
        >
          {label.client_code}
        </p>

        <p
          className="sticker-line sticker-line-client-name"
          style={stickerTextLine({
            fontSize: "2.3mm",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          })}
        >
          {label.client_name}
        </p>

        <p
          className="sticker-line sticker-line-code"
          style={stickerTextLine({
            fontSize: "2.25mm",
            letterSpacing: "0.04mm",
            fontVariantNumeric: "tabular-nums",
          })}
          spellCheck={false}
        >
          {label.production_code}
        </p>

        <p
          className="sticker-line sticker-line-fabric"
          style={stickerTextLine({
            fontSize: "2.2mm",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          })}
        >
          {fabricLine}
        </p>

        <p
          className="sticker-line sticker-line-cut-qty"
          style={stickerTextLine({
            fontSize: "2.55mm",
            letterSpacing: "0.14mm",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          })}
        >
          {cutLengthLine}
        </p>

        <p
          className="sticker-line sticker-line-cut-labels"
          style={stickerTextLine({
            fontSize: "2.2mm",
            letterSpacing: "0.05mm",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          })}
        >
          {labelsLine}
        </p>

        {specLine ? (
          <p
            className="sticker-line sticker-line-spec"
            style={stickerTextLine({
              fontSize: "2.05mm",
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            })}
          >
            {specLine}
          </p>
        ) : null}

        <p
          className="sticker-line sticker-line-piece"
          style={stickerTextLine({
            fontSize: "2.2mm",
            letterSpacing: "0.05mm",
            flexShrink: 0,
          })}
        >
          {pieceLabel}
        </p>
      </div>
    </div>
  );
}
