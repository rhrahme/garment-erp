"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, GripVertical, Move, Printer, QrCode, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useFactoryFloorStationPositions } from "@/hooks/useFactoryFloorStationPositions";
import { useFactoryWorkstationPositions } from "@/hooks/useFactoryWorkstationPositions";
import {
  FACTORY_FLOOR_MAP_IMAGE,
  FACTORY_FLOOR_MAP_PDF,
  factoryFloorStationStyle,
  factoryFloorStationsByZone,
  isProductionLineStation,
  PRODUCTION_LINE_STYLE,
  type FactoryFloorStation,
  type FactoryFloorZone,
} from "@/lib/production/factory-floor-stations";
import type { FactoryWorkstation } from "@/lib/production/factory-workstations";
import {
  FACTORY_WORKSTATIONS,
  hasMachineInfo,
  machineInfoLines,
  productionLineLabel,
  workstationId,
} from "@/lib/production/factory-workstations";
import { scanStageStyles } from "@/lib/production/scan-stage-highlight";
import { cn } from "@/lib/utils";
import { WorkstationQrDialog } from "@/components/production/WorkstationQrDialog";
import { WorkstationQrPdfPreviewModal } from "@/components/production/WorkstationQrPdfPreviewModal";

type ZoneFilter = FactoryFloorZone | "all";
type MapView = "interactive" | "label-map" | "workstation-details";
type LabelMapLayout = "all" | "pairs";
type WorkstationDetailLayout = "all" | "pairs";

const MAP_TABS: { id: MapView; label: string }[] = [
  { id: "interactive", label: "Interactive map" },
  { id: "label-map", label: "Label map (PDF)" },
  { id: "workstation-details", label: "Workstation details (PDF)" },
];

const LABEL_MAP_PDF_URL = "/api/factory/label-map";
const WORKSTATION_DETAIL_PDF_URL = "/api/factory/workstation-details";

function labelMapPdfUrl(layout: LabelMapLayout): string {
  return layout === "pairs" ? `${LABEL_MAP_PDF_URL}?layout=pairs` : LABEL_MAP_PDF_URL;
}

function labelMapPdfFilename(layout: LabelMapLayout): string {
  return layout === "pairs" ? "factory-label-map-pairs.pdf" : "factory-label-map.pdf";
}

function workstationDetailPdfUrl(layout: WorkstationDetailLayout): string {
  return layout === "all"
    ? `${WORKSTATION_DETAIL_PDF_URL}?layout=all`
    : `${WORKSTATION_DETAIL_PDF_URL}?layout=pairs`;
}

function workstationDetailPdfFilename(layout: WorkstationDetailLayout): string {
  return layout === "all"
    ? "factory-workstation-details-all.pdf"
    : "factory-workstation-details-pairs.pdf";
}

async function fetchLabelMapPdfBlob(layout: LabelMapLayout): Promise<Blob | null> {
  const res = await fetch(labelMapPdfUrl(layout));
  if (!res.ok) return null;
  return res.blob();
}

async function downloadLabelMapPdf(layout: LabelMapLayout): Promise<boolean> {
  const blob = await fetchLabelMapPdfBlob(layout);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = labelMapPdfFilename(layout);
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

async function fetchWorkstationDetailPdfBlob(layout: WorkstationDetailLayout): Promise<Blob | null> {
  const res = await fetch(workstationDetailPdfUrl(layout));
  if (!res.ok) return null;
  return res.blob();
}

async function downloadWorkstationDetailPdf(layout: WorkstationDetailLayout): Promise<boolean> {
  const blob = await fetchWorkstationDetailPdfBlob(layout);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = workstationDetailPdfFilename(layout);
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}

async function printLabelMapPdf(layout: LabelMapLayout): Promise<boolean> {
  const blob = await fetchLabelMapPdfBlob(layout);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  document.body.appendChild(iframe);

  return new Promise((resolve) => {
    iframe.onload = () => {
      const printWindow = iframe.contentWindow;
      if (!printWindow) {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
        resolve(false);
        return;
      }
      printWindow.focus();
      printWindow.print();
      window.setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
        resolve(true);
      }, 1000);
    };
  });
}

function StationPin({
  station,
  active,
  editMode,
  dragging,
  onPointerDown,
}: {
  station: FactoryFloorStation;
  active: boolean;
  editMode: boolean;
  dragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const style = factoryFloorStationStyle(station);
  const isLine = isProductionLineStation(station);
  const bgClass = style.chip.split(" ")[0];

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      className={cn(
        "group absolute z-10 touch-none -translate-x-1/2 -translate-y-1/2 focus:outline-none",
        editMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      )}
      style={{ left: `${station.x}%`, top: `${station.y}%` }}
      aria-label={isLine ? `${station.label} production line` : `${station.label} scan station`}
      aria-pressed={active}
    >
      {isLine ? (
        <span
          className={cn(
            "relative flex h-6 min-w-[2.25rem] items-center justify-center rounded-md border-2 px-0.5 text-[9px] font-bold shadow-md",
            PRODUCTION_LINE_STYLE.pin,
            !dragging && "transition-transform group-hover:scale-110",
            editMode && "h-7 w-7 ring-2 ring-amber-400 ring-offset-1",
            (active || dragging) && "scale-125 ring-indigo-500",
            dragging && "ring-amber-500"
          )}
        >
          {productionLineLabel(station.line_number)}
        </span>
      ) : (
        <span
          className={cn(
            "relative block h-5 w-5 rounded-full border-2 border-white shadow-md",
            bgClass,
            !dragging && "transition-transform group-hover:scale-110",
            editMode && "h-6 w-6 ring-2 ring-amber-400 ring-offset-1",
            (active || dragging) && "scale-125 ring-indigo-500",
            dragging && "ring-amber-500"
          )}
        />
      )}
      {editMode ? (
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white shadow">
          <GripVertical className="h-2.5 w-2.5" aria-hidden />
        </span>
      ) : null}
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold shadow-sm",
          style.chip,
          active || dragging ? "opacity-100" : "opacity-90 group-hover:opacity-100",
          editMode && "ring-1 ring-amber-300"
        )}
      >
        {station.label}
      </span>
    </button>
  );
}

function WorkstationPin({
  workstation,
  active,
  editMode,
  dragging,
  labelMap,
  onPointerDown,
}: {
  workstation: FactoryWorkstation;
  active: boolean;
  editMode: boolean;
  dragging: boolean;
  labelMap?: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const badgeLabel = workstationId(workstation.line_number, workstation.station_number);
  const machineLines = machineInfoLines(workstation);

  if (labelMap) {
    return (
      <div
        className="pointer-events-none absolute z-[15] -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${workstation.x}%`, top: `${workstation.y}%` }}
        aria-hidden
      >
        <span className="flex min-w-[2.75rem] items-center justify-center rounded-md border-2 border-slate-900 bg-white px-1 py-0.5 text-[11px] font-bold leading-none text-slate-900 shadow print:border-black print:shadow-none">
          {badgeLabel}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      className={cn(
        "group absolute z-[15] touch-none -translate-x-1/2 -translate-y-1/2 focus:outline-none",
        editMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      )}
      style={{ left: `${workstation.x}%`, top: `${workstation.y}%` }}
      aria-label={`${workstation.label} workstation`}
      aria-pressed={active}
    >
      <span
        className={cn(
          "relative flex h-6 min-w-[1.75rem] items-center justify-center rounded-md border-2 border-white bg-slate-900 px-1 text-[10px] font-bold leading-none text-white shadow-md [text-shadow:0_0_1px_rgba(0,0,0,0.8)]",
          !dragging && "transition-transform group-hover:scale-110",
          editMode && "h-7 min-w-[2rem] ring-2 ring-amber-400 ring-offset-1",
          (active || dragging) && "scale-125 ring-indigo-500",
          dragging && "ring-amber-500"
        )}
      >
        {badgeLabel}
      </span>
      {hasMachineInfo(workstation) ? (
        <span
          className={cn(
            "pointer-events-none absolute left-1/2 top-full z-20 mt-1 max-w-[9rem] -translate-x-1/2 rounded border border-slate-200 bg-white px-1.5 py-1 text-left text-[9px] font-medium leading-tight text-slate-700 shadow-md",
            active || dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            editMode && "opacity-100"
          )}
        >
          {machineLines.map((line) => (
            <span key={line} className="block truncate">
              {line}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}

/** Fixed grid for print — machines 9→1; PL badge at line start beside PL-X-1 (bottom). */
function LabelMapGrid() {
  const workstationById = useMemo(
    () => new Map(FACTORY_WORKSTATIONS.map((ws) => [ws.id, ws])),
    []
  );

  return (
    <div className="grid grid-cols-8 gap-x-1 print:grid-cols-8 print:gap-x-2">
      {Array.from({ length: 8 }, (_, index) => {
        const lineNumber = index + 1;
        return (
          <div key={lineNumber} className="flex flex-col items-center gap-0.5 print:gap-1">
            {Array.from({ length: 9 }, (_, machineIndex) => {
              const stationNumber = 9 - machineIndex;
              const id = workstationId(lineNumber, stationNumber);
              const ws = workstationById.get(id);
              const infoLines = ws ? machineInfoLines(ws) : [];
              return (
                <span
                  key={stationNumber}
                  className="flex min-h-[2.75rem] min-w-[2.75rem] flex-col items-center justify-start rounded-md border-2 border-slate-900 bg-white px-0.5 py-0.5 text-center leading-tight text-slate-900 print:min-h-[3rem] print:border-black"
                >
                  <span className="text-[9px] font-bold leading-none print:text-[10px]">{id}</span>
                  {infoLines.map((line, lineIndex) => (
                    <span
                      key={lineIndex}
                      className={cn(
                        "mt-0.5 line-clamp-2 text-[7px] leading-tight print:text-[8px]",
                        lineIndex === infoLines.length - 1 && ws?.machine_reference === line
                          ? "font-semibold"
                          : "font-normal"
                      )}
                    >
                      {line}
                    </span>
                  ))}
                </span>
              );
            })}
            <span
              className={cn(
                "mt-0.5 flex h-7 min-w-[2.5rem] items-center justify-center rounded-md border-2 px-1 text-[11px] font-bold print:mt-1 print:border-black",
                PRODUCTION_LINE_STYLE.pin
              )}
            >
              {productionLineLabel(lineNumber)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function FactoryFloorMapViewer() {
  const {
    stations,
    updatePosition,
    saveToBrowser,
    resetToDefaults,
    dirty,
    hasBrowserOverrides,
  } = useFactoryFloorStationPositions();

  const {
    workstations,
    updatePosition: updateWorkstationPosition,
    saveToBrowser: saveWorkstationsToBrowser,
    resetToDefaults: resetWorkstationDefaults,
    dirty: workstationsDirty,
    hasBrowserOverrides: hasWorkstationOverrides,
  } = useFactoryWorkstationPositions();

  const [zoom, setZoom] = useState(100);
  const [mapView, setMapView] = useState<MapView>("interactive");
  const [zone, setZone] = useState<ZoneFilter>("all");
  const [showStations, setShowStations] = useState(true);
  const [showWorkstations, setShowWorkstations] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWorkstationId, setSelectedWorkstationId] = useState<string | null>(null);
  const [qrWorkstation, setQrWorkstation] = useState<FactoryWorkstation | null>(null);
  const [qrPdfPreviewOpen, setQrPdfPreviewOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingWorkstationId, setDraggingWorkstationId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingServer, setSavingServer] = useState(false);
  const [labelMapLayout, setLabelMapLayout] = useState<LabelMapLayout>("all");
  const [workstationDetailLayout, setWorkstationDetailLayout] = useState<WorkstationDetailLayout>("pairs");
  const [downloadingLabelMapPdf, setDownloadingLabelMapPdf] = useState(false);
  const [printingLabelMapPdf, setPrintingLabelMapPdf] = useState(false);
  const [downloadingWorkstationDetailPdf, setDownloadingWorkstationDetailPdf] = useState(false);
  const [labelMapDownloadError, setLabelMapDownloadError] = useState<string | null>(null);
  const [workstationDetailDownloadError, setWorkstationDetailDownloadError] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const dragWorkstationIdRef = useRef<string | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const visibleStations = factoryFloorStationsByZone(zone, stations);
  const workstationZoneActive = zone === "all" || zone === "production_line";
  const showWorkstationPins = showWorkstations && workstationZoneActive;
  const visibleWorkstations = showWorkstationPins ? workstations : [];

  useEffect(() => {
    if (zone === "production_line") setShowWorkstations(true);
  }, [zone]);
  const selected = stations.find((s) => s.id === selectedId) ?? null;
  const selectedWorkstation = workstations.find((ws) => ws.id === selectedWorkstationId) ?? null;
  const mapLegendStages = useMemo(() => {
    const seen = new Set<string>();
    return stations
      .filter((station): station is Extract<FactoryFloorStation, { scan_stage: string }> => {
        if (isProductionLineStation(station)) return false;
        if (seen.has(station.scan_stage)) return false;
        seen.add(station.scan_stage);
        return true;
      })
      .map((station) => ({
        stage: station.scan_stage,
        label: `${scanStageStyles(station.scan_stage).label} — ${station.label}`,
      }));
  }, [stations]);

  const productionLineCount = useMemo(
    () => stations.filter(isProductionLineStation).length,
    [stations]
  );

  const positionFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x, y };
  }, []);

  const clearDragListeners = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  }, []);

  const finishDrag = useCallback(() => {
    clearDragListeners();
    const hadStation = Boolean(dragIdRef.current);
    const hadWorkstation = Boolean(dragWorkstationIdRef.current);
    dragIdRef.current = null;
    dragWorkstationIdRef.current = null;
    setDraggingId(null);
    setDraggingWorkstationId(null);
    if (!hadStation && !hadWorkstation) return;
    if (hadStation) saveToBrowser();
    if (hadWorkstation) saveWorkstationsToBrowser();
    setSaveMessage("Position saved in this browser.");
    setTimeout(() => setSaveMessage(null), 2500);
  }, [clearDragListeners, saveToBrowser, saveWorkstationsToBrowser]);

  const handlePinPointerDown = useCallback(
    (stationId: string, event: React.PointerEvent<HTMLButtonElement>) => {
      if (!editMode) {
        setSelectedId(stationId);
        setSelectedWorkstationId(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      clearDragListeners();
      dragIdRef.current = stationId;
      setDraggingId(stationId);
      setSelectedId(stationId);

      const onMove = (moveEvent: PointerEvent) => {
        if (dragIdRef.current !== stationId) return;
        const pos = positionFromClient(moveEvent.clientX, moveEvent.clientY);
        if (!pos) return;
        updatePosition(stationId, pos.x, pos.y);
      };
      const onUp = () => finishDrag();

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      dragCleanupRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [clearDragListeners, editMode, finishDrag, positionFromClient, updatePosition]
  );

  const handleWorkstationPointerDown = useCallback(
    (workstationId: string, event: React.PointerEvent<HTMLButtonElement>) => {
      const workstation = workstations.find((ws) => ws.id === workstationId);
      if (!workstation) return;

      if (!editMode) {
        setSelectedWorkstationId(workstationId);
        setSelectedId(null);
        setQrWorkstation(workstation);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      clearDragListeners();
      dragWorkstationIdRef.current = workstationId;
      setDraggingWorkstationId(workstationId);
      setSelectedWorkstationId(workstationId);
      setSelectedId(null);

      const onMove = (moveEvent: PointerEvent) => {
        if (dragWorkstationIdRef.current !== workstationId) return;
        const pos = positionFromClient(moveEvent.clientX, moveEvent.clientY);
        if (!pos) return;
        updateWorkstationPosition(workstationId, pos.x, pos.y);
      };
      const onUp = () => finishDrag();

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      dragCleanupRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      clearDragListeners,
      editMode,
      finishDrag,
      positionFromClient,
      updateWorkstationPosition,
      workstations,
    ]
  );

  useEffect(() => () => clearDragListeners(), [clearDragListeners]);

  const handleDownloadLabelMapPdf = useCallback(() => {
    setLabelMapDownloadError(null);
    setDownloadingLabelMapPdf(true);
    void downloadLabelMapPdf(labelMapLayout)
      .then((ok) => {
        if (!ok) setLabelMapDownloadError("PDF download failed — try again.");
      })
      .finally(() => setDownloadingLabelMapPdf(false));
  }, [labelMapLayout]);

  const handlePrintLabelMapPdf = useCallback(() => {
    setLabelMapDownloadError(null);
    setPrintingLabelMapPdf(true);
    void printLabelMapPdf(labelMapLayout)
      .then((ok) => {
        if (!ok) setLabelMapDownloadError("PDF print failed — try again.");
      })
      .finally(() => setPrintingLabelMapPdf(false));
  }, [labelMapLayout]);

  const handleDownloadWorkstationDetailPdf = useCallback(() => {
    setWorkstationDetailDownloadError(null);
    setDownloadingWorkstationDetailPdf(true);
    void downloadWorkstationDetailPdf(workstationDetailLayout)
      .then((ok) => {
        if (!ok) setWorkstationDetailDownloadError("PDF download failed — try again.");
      })
      .finally(() => setDownloadingWorkstationDetailPdf(false));
  }, [workstationDetailLayout]);

  async function saveToServer() {
    setSaveError(null);
    setSaveMessage(null);
    setSavingServer(true);
    try {
      const [stationsRes, workstationsRes] = await Promise.all([
        fetch("/api/factory/floor-stations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            positions: stations.map((s) => ({ id: s.id, x: s.x, y: s.y })),
          }),
        }),
        fetch("/api/factory/workstations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            positions: workstations.map((ws) => ({ id: ws.id, x: ws.x, y: ws.y })),
          }),
        }),
      ]);
      const stationsData = await stationsRes.json();
      const workstationsData = await workstationsRes.json();
      if (!stationsRes.ok) throw new Error(stationsData.error ?? "Failed to save scan station positions");
      if (!workstationsRes.ok) {
        throw new Error(workstationsData.error ?? "Failed to save workstation positions");
      }
      saveToBrowser();
      saveWorkstationsToBrowser();
      setSaveMessage("Saved for everyone — scan stations and workstations written to ERP data.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save positions");
    } finally {
      setSavingServer(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white print:hidden">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
          {MAP_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMapView(tab.id);
                if (tab.id !== "interactive") setEditMode(false);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                mapView === tab.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-medium text-slate-900">Hagan factory layout</p>
            <p className="text-sm text-slate-600">
              {mapView === "label-map" ? (
                <>
                  Sewing block only — PL1–PL8 columns with PL-{"{line}"}-{"{machine}"} labels (A4 landscape
                  print).
                </>
              ) : mapView === "workstation-details" ? (
                <>
                  Printable cards with full machine use and model/reference for every PL-1-1 … PL-8-9 station.
                  Machines listed 9→1 with a production line badge at the bottom of each column.
                </>
              ) : (
                <>
                  Scan stations and production lines on the floor plan — colours match Fabric Receiving &amp; Production.
                  {!editMode ? (
                    <span className="mt-1 block text-amber-800">
                      Use <strong>Adjust pin positions</strong> to drag scan stations and PL line markers onto your
                      layout.
                    </span>
                  ) : null}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mapView === "interactive" ? (
              <>
                <Button
                  type="button"
                  variant={editMode ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setEditMode((value) => !value)}
                >
                  <Move className="mr-1 h-4 w-4" />
                  {editMode ? "Done adjusting" : "Adjust pin positions"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setZoom((value) => Math.max(60, value - 15))}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="min-w-[3.5rem] text-center text-sm font-medium text-slate-700">{zoom}%</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setZoom((value) => Math.min(180, value + 15))}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <a href={FACTORY_FLOOR_MAP_PDF} target="_blank" rel="noreferrer">
                  <Button type="button" variant="secondary" size="sm">
                    <ExternalLink className="mr-1 h-4 w-4" />
                    Floor plan PDF
                  </Button>
                </a>
              </>
            ) : mapView === "label-map" ? (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={downloadingLabelMapPdf || printingLabelMapPdf}
                  onClick={handleDownloadLabelMapPdf}
                >
                  <Download className="mr-1 h-4 w-4" />
                  {downloadingLabelMapPdf ? "Downloading…" : "Download PDF"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={printingLabelMapPdf || downloadingLabelMapPdf}
                  onClick={handlePrintLabelMapPdf}
                >
                  <Printer className="mr-1 h-4 w-4" />
                  {printingLabelMapPdf ? "Preparing…" : "Print label map"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={downloadingWorkstationDetailPdf}
                  onClick={handleDownloadWorkstationDetailPdf}
                >
                  <Download className="mr-1 h-4 w-4" />
                  {downloadingWorkstationDetailPdf ? "Downloading…" : "Download PDF"}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setQrPdfPreviewOpen(true)}>
                  <Printer className="mr-1 h-4 w-4" />
                  Workstation QRs
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {mapView === "interactive" && editMode ? (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 print:hidden">
          <p className="flex items-center gap-2 font-semibold">
            <Move className="h-4 w-4 shrink-0" aria-hidden />
            Adjust mode — drag icons to match your floor layout
          </p>
          <p className="mt-1.5">
            Click and drag any pin — scan stations (coloured dots) or production lines (numbered badges). Positions
            auto-save in this browser when you release. Admins can use <strong>Save for all users</strong> to update the
            shared layout.
          </p>
        </div>
      ) : null}

      {saveMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 print:hidden">
          {saveMessage}
        </div>
      ) : null}
      {saveError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 print:hidden">
          {saveError}
        </div>
      ) : null}

      {mapView === "interactive" ? (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Show</span>
        {(
          [
            { id: "all", label: "All pins" },
            { id: "fabric_receiving", label: "Fabric receiving" },
            { id: "production", label: "Production" },
            { id: "production_line", label: "Production lines" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setZone(item.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              zone === item.id ? "bg-indigo-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
            )}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowStations((value) => !value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            showStations ? "bg-slate-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
          )}
        >
          {showStations ? "Hide pins" : "Show pins"}
        </button>
        <button
          type="button"
          onClick={() => setShowWorkstations((value) => !value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            showWorkstations ? "bg-slate-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
          )}
        >
          {showWorkstations ? "Hide workstations" : "Show workstations"}
        </button>
        {hasBrowserOverrides || dirty || hasWorkstationOverrides || workstationsDirty ? (
          <button
            type="button"
            onClick={() => {
              resetToDefaults();
              resetWorkstationDefaults();
              setSaveMessage("Reset to default positions.");
              setTimeout(() => setSaveMessage(null), 2500);
            }}
            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
          >
            Reset positions
          </button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={savingServer}
          onClick={() => void saveToServer()}
        >
          {savingServer ? "Saving…" : "Save for all users"}
        </Button>
      </div>
      ) : null}

      {mapView === "label-map" ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950 print:hidden">
          <p className="font-semibold">Label map — sewing block only</p>
          <p className="mt-1 text-indigo-900/90">
            Cropped to the 8 production lines (PL1–PL8) and 72 machines (PL-1-1 through PL-8-9). Receive, wash,
            cutting, finishing, and storage areas are hidden.
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-indigo-200/80 pt-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800/80">Choose PDF layout</p>
              <div className="inline-flex rounded-lg border border-indigo-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setLabelMapLayout("all")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    labelMapLayout === "all"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-700 hover:bg-indigo-50"
                  )}
                >
                  All 8 lines (1 page)
                </button>
                <button
                  type="button"
                  onClick={() => setLabelMapLayout("pairs")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    labelMapLayout === "pairs"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-700 hover:bg-indigo-50"
                  )}
                >
                  2 lines per page (4 pages)
                </button>
              </div>
              <p className="text-xs text-indigo-900/80">
                {labelMapLayout === "all"
                  ? "All 8 columns on one A4 landscape sheet — each cell shows PL-X-Y, machine use, and reference code."
                  : "Handwriting layout — taller cells with extra space below each machine (PL1+PL2, PL3+PL4, …)."}
              </p>
            </div>
          </div>
          {labelMapDownloadError ? (
            <p className="mt-3 text-sm font-medium text-red-700">{labelMapDownloadError}</p>
          ) : null}
        </div>
      ) : mapView === "workstation-details" ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 print:hidden">
          <div className="space-y-2">
            <p className="font-semibold">Workstation details — printable cards</p>
            <p className="text-slate-600">
              Full-detail cards (large ID, machine use, model/reference) for every PL-1-1 … PL-8-9 station.
            </p>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setWorkstationDetailLayout("pairs")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  workstationDetailLayout === "pairs"
                    ? "bg-slate-800 text-white"
                    : "text-slate-700 hover:bg-white"
                )}
              >
                2 lines per page (4 pages)
              </button>
              <button
                type="button"
                onClick={() => setWorkstationDetailLayout("all")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  workstationDetailLayout === "all"
                    ? "bg-slate-800 text-white"
                    : "text-slate-700 hover:bg-white"
                )}
              >
                1 line per page (8 pages)
              </button>
            </div>
          </div>
          {workstationDetailDownloadError ? (
            <p className="mt-3 text-sm font-medium text-red-700">{workstationDetailDownloadError}</p>
          ) : null}
        </div>
      ) : null}

      {mapView === "label-map" ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-center gap-3 rounded-xl border-2 border-indigo-400 bg-indigo-600 px-4 py-4 shadow-md print:hidden">
          <p className="w-full text-center text-sm font-semibold text-white sm:w-auto sm:text-left">
            Ready to print machine stickers
          </p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="min-h-11 border-0 bg-white px-8 text-base font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50"
            disabled={downloadingLabelMapPdf || printingLabelMapPdf}
            onClick={handleDownloadLabelMapPdf}
          >
            <Download className="mr-2 h-5 w-5" />
            {downloadingLabelMapPdf ? "Downloading…" : "Download PDF"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="min-h-11 px-6 text-base text-white hover:bg-indigo-500/80"
            disabled={printingLabelMapPdf || downloadingLabelMapPdf}
            onClick={handlePrintLabelMapPdf}
          >
            <Printer className="mr-2 h-5 w-5" />
            {printingLabelMapPdf ? "Preparing…" : "Print label map"}
          </Button>
        </div>
      ) : null}

      {mapView === "label-map" ? (
        <div
          id="factory-label-map"
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <p className="mb-3 text-center text-sm font-semibold text-slate-900">
            Hagan factory — production line machine labels
          </p>
          <p className="mb-3 text-center text-xs text-slate-500">
            On-screen preview. PDF download and print use the layout selected above (machine use + reference included).
          </p>
          <div className="mx-auto max-w-4xl">
            <LabelMapGrid />
          </div>
        </div>
      ) : mapView === "interactive" ? (
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-2">
          <div
            className="mx-auto origin-top transition-transform"
            style={{ width: `${zoom}%`, minWidth: zoom < 100 ? "100%" : undefined }}
          >
            <div
              ref={mapRef}
              className={cn(
                "relative w-full",
                editMode && "cursor-crosshair ring-2 ring-amber-300 ring-offset-2"
              )}
              style={{ aspectRatio: "2000 / 1414" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={FACTORY_FLOOR_MAP_IMAGE}
                alt="Hagan factory floor layout"
                className="h-full w-full select-none object-contain"
                draggable={false}
              />
              {showStations &&
                visibleStations.map((station) => (
                  <StationPin
                    key={station.id}
                    station={station}
                    active={selectedId === station.id}
                    editMode={editMode}
                    dragging={draggingId === station.id}
                    onPointerDown={(event) => handlePinPointerDown(station.id, event)}
                  />
                ))}
              {visibleWorkstations.map((workstation) => (
                <WorkstationPin
                  key={workstation.id}
                  workstation={workstation}
                  active={selectedWorkstationId === workstation.id}
                  editMode={editMode}
                  dragging={draggingWorkstationId === workstation.id}
                  onPointerDown={(event) => handleWorkstationPointerDown(workstation.id, event)}
                />
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected</p>
            {selectedWorkstation && !selected ? (
              <div className="mt-2 space-y-2">
                <p className="text-lg font-semibold text-slate-900">{selectedWorkstation.id}</p>
                <span className="inline-block rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-white">
                  {productionLineLabel(selectedWorkstation.line_number)}
                </span>
                <p className="font-mono text-xs text-slate-500">
                  x {selectedWorkstation.x}% · y {selectedWorkstation.y}%
                </p>
                <p className="text-sm text-slate-600">{selectedWorkstation.label}</p>
                {hasMachineInfo(selectedWorkstation) ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {selectedWorkstation.machine_use ? (
                      <p className="font-medium text-slate-900">{selectedWorkstation.machine_use}</p>
                    ) : null}
                    {selectedWorkstation.machine_reference ? (
                      <p className="font-mono text-xs text-slate-600">{selectedWorkstation.machine_reference}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No machine use recorded on factory sheet.</p>
                )}
                {!editMode ? (
                  <button
                    type="button"
                    onClick={() => setQrWorkstation(selectedWorkstation)}
                    className="inline-flex items-center text-sm font-medium text-indigo-700 hover:text-indigo-900"
                  >
                    <QrCode className="mr-1 h-4 w-4" />
                    Show QR code
                  </button>
                ) : (
                  <p className="text-xs text-amber-800">Drag the pin on the map to reposition.</p>
                )}
              </div>
            ) : selected ? (
              <div className="mt-2 space-y-2">
                <p className="text-lg font-semibold text-slate-900">{selected.label}</p>
                <span
                  className={cn(
                    "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                    factoryFloorStationStyle(selected).chip
                  )}
                >
                  {factoryFloorStationStyle(selected).label}
                </span>
                <p className="font-mono text-xs text-slate-500">
                  x {selected.x}% · y {selected.y}%
                </p>
                <p className="text-sm text-slate-600">{selected.description}</p>
                {!editMode && !isProductionLineStation(selected) ? (
                  <Link
                    href={selected.erp_href}
                    className="inline-block text-sm font-medium text-indigo-700 hover:text-indigo-900"
                  >
                    Open {selected.zone === "fabric_receiving" ? "Fabric Receiving" : "Production"} →
                  </Link>
                ) : editMode ? (
                  <p className="text-xs text-amber-800">Drag the pin on the map to reposition.</p>
                ) : (
                  <p className="text-xs text-slate-500">Reference marker — no scan action.</p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                {editMode ? "Select a pin, then drag it to the correct area." : "Tap a pin for scan instructions."}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scan station colours</p>
            <ul className="mt-2 space-y-1.5">
              {mapLegendStages.map((item) => {
                const { chip } = scanStageStyles(item.stage);
                return (
                  <li key={item.stage} className="flex items-center gap-2 text-xs text-slate-700">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", chip.split(" ")[0])} />
                    {item.label}
                  </li>
                );
              })}
            </ul>
            {productionLineCount > 0 ? (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Production lines</p>
                <ul className="mt-2 space-y-1.5">
                  <li className="flex items-center gap-2 text-xs text-slate-700">
                    <span
                      className={cn(
                        "flex h-4 min-w-[1.75rem] shrink-0 items-center justify-center rounded-sm border px-0.5 text-[8px] font-bold",
                        PRODUCTION_LINE_STYLE.pin
                      )}
                    >
                      PL1
                    </span>
                    PL badges — PL1 nearest Receive, through PL{productionLineCount}
                  </li>
                  <li className="flex items-center gap-2 text-xs text-slate-700">
                    <span className="flex h-5 min-w-[2.5rem] shrink-0 items-center justify-center rounded-md border border-white bg-slate-900 px-1 text-[8px] font-bold text-white shadow-sm">
                      PL-1-3
                    </span>
                    Machines (PL-{"{line}"}-{"{machine}"}, e.g. PL-1-3) — 72 pins on sewing columns
                  </li>
                </ul>
              </>
            ) : null}
          </div>
        </aside>
      </div>
      ) : null}

      {mapView === "interactive" && qrWorkstation ? (
        <WorkstationQrDialog
          workstation={qrWorkstation}
          onClose={() => setQrWorkstation(null)}
          onOpenPdfPreview={() => {
            setQrWorkstation(null);
            setQrPdfPreviewOpen(true);
          }}
        />
      ) : null}
      {mapView === "interactive" || mapView === "workstation-details" ? (
        <WorkstationQrPdfPreviewModal open={qrPdfPreviewOpen} onClose={() => setQrPdfPreviewOpen(false)} />
      ) : null}
    </div>
  );
}
