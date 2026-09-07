"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStitchScanCapture } from "@/components/production/stitch-scan-capture";
import {
  cameraScanPayload,
  isBrowserQrDetectorAvailable,
  shouldAcceptCameraDecode,
} from "@/lib/production/stitch-camera-scan";
import { cn } from "@/lib/utils";

type QrHit = { rawValue?: string };
type QrDetector = { detect: (source: HTMLVideoElement) => Promise<QrHit[]> };

function createQrDetector(): QrDetector | null {
  const Detector = (
    globalThis as {
      BarcodeDetector?: new (init: { formats: string[] }) => QrDetector;
    }
  ).BarcodeDetector;
  if (typeof Detector !== "function") return null;
  try {
    return new Detector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

export function StitchCameraScanner() {
  const { submitScan, kioskPaused } = useStitchScanCapture();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<QrDetector | null>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(false);
  const detectingRef = useRef(false);
  const lastAcceptedRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    detectingRef.current = false;
    const stream = streamRef.current;
    streamRef.current = null;
    detectorRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    setOpen(false);
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector) return;

    const loop = async () => {
      if (!activeRef.current) return;
      if (video.readyState >= 2 && !detectingRef.current) {
        detectingRef.current = true;
        try {
          const hits = await detector.detect(video);
          const raw = hits[0]?.rawValue ?? "";
          const now = Date.now();
          if (
            shouldAcceptCameraDecode({
              raw,
              lastAccepted: lastAcceptedRef.current.code,
              lastAcceptedAt: lastAcceptedRef.current.at,
              now,
            })
          ) {
            const accepted = cameraScanPayload(raw);
            lastAcceptedRef.current = { code: accepted, at: now };
            setHeard(accepted);
            submitScan(raw);
          }
        } catch {
          // Next frame. Do not stop the camera on a single detect miss.
        } finally {
          detectingRef.current = false;
        }
      }
      if (!activeRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        void loop();
      });
    };
    void loop();
  }, [submitScan]);

  const startCamera = useCallback(async () => {
    setError(null);
    setHeard(null);
    if (kioskPaused) {
      setError("Stitch kiosk is paused. Resume it before scanning.");
      return;
    }
    if (!isBrowserQrDetectorAvailable() || !createQrDetector()) {
      setError(
        "This browser cannot read a QR with the camera. Use Chrome on the tablet, or keep using the gun scanner."
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This tablet cannot open the camera here. Use the gun scanner.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      detectorRef.current = createQrDetector();
      const video = videoRef.current;
      if (!video || !detectorRef.current) {
        for (const track of stream.getTracks()) track.stop();
        streamRef.current = null;
        setError("Could not start the camera view.");
        return;
      }
      video.srcObject = stream;
      await video.play();
      activeRef.current = true;
      setOpen(true);
      tick();
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        setError("Allow camera access in the browser, then try again. The gun scanner still works.");
      } else if (name === "NotFoundError") {
        setError("No camera found on this tablet. Use the gun scanner.");
      } else {
        setError(err instanceof Error ? err.message : "Could not open the camera.");
      }
      stopCamera();
    }
  }, [kioskPaused, stopCamera, tick]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (kioskPaused && open) stopCamera();
  }, [kioskPaused, open, stopCamera]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-800">Tablet camera</p>
      <p className="mt-1 text-sm text-slate-600">
        Point the tablet at the ID badge, then the wall Attendance QR. Same as the gun
        scanner. A4 piece QRs work too.
      </p>
      <p className="mt-1 text-sm text-slate-600">
        BANGLA: Tablet camera diye age badge, tarpor wall QR. Gun scanner o kaj kore.
      </p>
      {error ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {error}
        </p>
      ) : null}
      {heard && open ? (
        <p className="mt-2 font-mono text-sm text-emerald-800">Read: {heard}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {open ? (
          <button
            type="button"
            onClick={stopCamera}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Close camera
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={kioskPaused}
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-xl px-4 py-2 text-sm font-semibold text-white",
              kioskPaused ? "cursor-not-allowed bg-slate-400" : "bg-slate-900 hover:bg-slate-800"
            )}
          >
            Use tablet camera
          </button>
        )}
      </div>
      <video
        ref={videoRef}
        className={cn(
          "mt-3 w-full rounded-lg bg-black object-cover",
          open ? "aspect-video" : "hidden"
        )}
        muted
        playsInline
        autoPlay
      />
    </div>
  );
}
