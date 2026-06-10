"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, GripVertical, Move, Printer, QrCode, ZoomIn, ZoomOut } from "lucide-react";
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
import { scanStageStyles } from "@/lib/production/scan-stage-highlight";
import { cn } from "@/lib/utils";
import { WorkstationQrDialog } from "@/components/production/WorkstationQrDialog";
import { WorkstationQrPdfPreviewModal } from "@/components/production/WorkstationQrPdfPreviewModal";

type ZoneFilter = FactoryFloorZone | "all";

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
            "relative flex h-6 w-6 items-center justify-center rounded-md border-2 text-[11px] font-bold shadow-md",
            PRODUCTION_LINE_STYLE.pin,
            !dragging && "transition-transform group-hover:scale-110",
            editMode && "h-7 w-7 ring-2 ring-amber-400 ring-offset-1",
            (active || dragging) && "scale-125 ring-indigo-500",
            dragging && "ring-amber-500"
          )}
        >
          {station.line_number}
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
  onPointerDown,
}: {
  workstation: FactoryWorkstation;
  active: boolean;
  editMode: boolean;
  dragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const badgeLabel = `${workstation.line_number}·${workstation.station_number}`;

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
    </button>
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
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <p className="font-medium text-slate-900">Hagan factory layout</p>
          <p className="text-sm text-slate-600">
            Scan stations and production lines on the floor plan — colours match Fabric Receiving &amp; Production.
            {!editMode ? (
              <span className="mt-1 block text-amber-800">
                Use <strong>Adjust pin positions</strong> to drag scan stations and numbered line markers onto your
                layout.
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              Open PDF
            </Button>
          </a>
          <Button type="button" variant="secondary" size="sm" onClick={() => setQrPdfPreviewOpen(true)}>
            <Printer className="mr-1 h-4 w-4" />
            Workstation QRs
          </Button>
        </div>
      </div>

      {editMode ? (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {saveMessage}
        </div>
      ) : null}
      {saveError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{saveError}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
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
                  Workstation · Line {selectedWorkstation.line_number}
                </span>
                <p className="font-mono text-xs text-slate-500">
                  x {selectedWorkstation.x}% · y {selectedWorkstation.y}%
                </p>
                <p className="text-sm text-slate-600">{selectedWorkstation.label}</p>
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
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[9px] font-bold",
                        PRODUCTION_LINE_STYLE.pin
                      )}
                    >
                      1
                    </span>
                    Numbered badges — Line 1 nearest Receive, through Line {productionLineCount}
                  </li>
                  <li className="flex items-center gap-2 text-xs text-slate-700">
                    <span className="flex h-5 min-w-[1.75rem] shrink-0 items-center justify-center rounded-md border border-white bg-slate-900 px-1 text-[9px] font-bold text-white shadow-sm">
                      1·3
                    </span>
                    Workstations (line·table, e.g. 1·3 = Line 1 Table 3) — 72 pins on sewing columns
                  </li>
                </ul>
              </>
            ) : null}
          </div>
        </aside>
      </div>

      {qrWorkstation ? (
        <WorkstationQrDialog
          workstation={qrWorkstation}
          onClose={() => setQrWorkstation(null)}
          onOpenPdfPreview={() => {
            setQrWorkstation(null);
            setQrPdfPreviewOpen(true);
          }}
        />
      ) : null}
      <WorkstationQrPdfPreviewModal open={qrPdfPreviewOpen} onClose={() => setQrPdfPreviewOpen(false)} />
    </div>
  );
}
