"use client";

import {
  LABEL_STICKER_COLUMN_GAP_MM,
  LABEL_STICKER_FONT_MM,
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

function formatWeight(weightGsm: number | null): string | null {
  if (weightGsm == null) return null;
  return `${weightGsm} gsm`;
}

/** One 100 × 50 mm roll label — QR left, text right, thermal-readable sizes. */
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
  const qrUrl = qrImageUrl(label.qr_payload, 450);
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
        flexDirection: "row",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
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
        }}
      />

      <div
        className="sticker-cell-body"
        style={{
          flex: 1,
          minWidth: 0,
          marginLeft: `${LABEL_STICKER_COLUMN_GAP_MM}mm`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: `${LABEL_STICKER_LINE_GAP_MM}mm`,
        }}
      >
        <div
          className="sticker-header-row"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "1mm",
            flexShrink: 0,
          }}
        >
          <span
            className="sticker-role-mark"
            style={stickerTextLine({
              fontSize: `${LABEL_STICKER_FONT_MM.header}mm`,
              letterSpacing: "0.02mm",
              lineHeight: 1.1,
              whiteSpace: "nowrap",
            })}
          >
            {STICKER_ROLE_LABEL[stickerRole]}
          </span>
          <span
            className="sticker-batch-mark"
            style={stickerTextLine({
              fontSize: `${LABEL_STICKER_FONT_MM.header}mm`,
              letterSpacing: "0.04mm",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              visibility: batchMark ? "visible" : "hidden",
            })}
          >
            {batchMark ?? "\u00a0"}
          </span>
        </div>

        <p
          className="sticker-line sticker-line-client"
          style={stickerTextLine({
            fontSize: `${LABEL_STICKER_FONT_MM.clientCode}mm`,
            letterSpacing: "0.04mm",
            fontVariantNumeric: "tabular-nums",
          })}
        >
          {label.client_code}
        </p>

        <p
          className="sticker-line sticker-line-client-name"
          style={stickerTextLine({
            fontSize: `${LABEL_STICKER_FONT_MM.clientName}mm`,
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
            fontSize: `${LABEL_STICKER_FONT_MM.productionCode}mm`,
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
            fontSize: `${LABEL_STICKER_FONT_MM.fabric}mm`,
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
            fontSize: `${LABEL_STICKER_FONT_MM.cutLength}mm`,
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
            fontSize: `${LABEL_STICKER_FONT_MM.labels}mm`,
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
              fontSize: `${LABEL_STICKER_FONT_MM.spec}mm`,
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
            fontSize: `${LABEL_STICKER_FONT_MM.piece}mm`,
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
