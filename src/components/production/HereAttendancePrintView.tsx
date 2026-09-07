import { qrSvgModel } from "@/lib/production/qr-render";
import { ATTENDANCE_WALL_QR_PAYLOAD } from "@/lib/production/stitch-attendance";

const PRINT_CSS = `
@page {
  size: A4 portrait;
  margin: 12mm;
}
html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  color: #111;
  font-family: Helvetica, Arial, sans-serif;
}
.here-print-sheet {
  page-break-after: always;
  width: 186mm;
  min-height: 273mm;
  box-sizing: border-box;
  padding: 10mm 8mm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.here-print-sheet:last-child {
  page-break-after: auto;
}
.here-print-kicker {
  font-size: 16pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin: 0 0 8pt;
}
.here-print-title {
  font-size: 28pt;
  font-weight: 700;
  margin: 0 0 10pt;
  line-height: 1.15;
}
.here-print-qr {
  margin: 8pt 0 12pt;
}
.here-print-steps {
  font-size: 14pt;
  line-height: 1.35;
  margin: 0;
  max-width: 160mm;
}
.here-print-bn {
  font-size: 13pt;
  line-height: 1.35;
  margin: 10pt 0 0;
  max-width: 160mm;
}
.no-print {
  font-family: Helvetica, Arial, sans-serif;
}
@media print {
  .no-print { display: none !important; }
}
`;

export function HereAttendancePrintView({ copies = 6 }: { copies?: number }) {
  const sheets = Math.max(1, Math.min(copies, 24));
  const qr = qrSvgModel(ATTENDANCE_WALL_QR_PAYLOAD);
  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="no-print" style={{ padding: "12px 16px" }}>
        <p style={{ fontFamily: "Helvetica, Arial, sans-serif", fontSize: "12pt", margin: 0 }}>
          Print {sheets} Attendance posters. Hang them at the entrance. Badge and wall QR,
          either order - both register. You may scan today to test. Clock-in time counts
          from 8 Sep 2026 (Riyadh). Attendance does not start a piece. When they stitch:
          badge again, then garment A4.
        </p>
      </div>
      {Array.from({ length: sheets }, (_, index) => (
        <section key={index} className="here-print-sheet">
          <p className="here-print-kicker">ATTENDANCE</p>
          <h1 className="here-print-title">Hajira</h1>
          <div className="here-print-qr">
            <svg
              viewBox={`0 0 ${qr.edge} ${qr.edge}`}
              width="360"
              height="360"
              role="img"
              aria-label={`QR ${ATTENDANCE_WALL_QR_PAYLOAD}`}
              shapeRendering="crispEdges"
            >
              <rect width={qr.edge} height={qr.edge} fill="#ffffff" />
              <path d={qr.path} fill="#000000" />
            </svg>
          </div>
          <p className="here-print-steps">
            Scan your ID badge and this wall QR ({ATTENDANCE_WALL_QR_PAYLOAD}), either
            order.
            <br />
            Attendance only. Does not start a piece.
            <br />
            When you start stitching: scan your badge again, then the garment A4.
          </p>
          <p className="here-print-bn">
            BANGLA: Badge ar ei wall QR, jei order e hok. Dui order e register. Eita
            attendance only. Stitching shuru korte pore abar badge + A4.
          </p>
        </section>
      ))}
    </>
  );
}
