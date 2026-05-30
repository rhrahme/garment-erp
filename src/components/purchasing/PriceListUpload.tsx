"use client";

import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PRICE_LIST_IMPORT_COLUMNS } from "@/lib/fabric-sourcing/email-content";

interface PriceListUploadProps {
  supplierName: string;
  onParsed?: (rows: Record<string, string>[]) => void;
}

export function PriceListUpload({ supplierName, onParsed }: PriceListUploadProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [dragging, setDragging] = useState(false);

  const parseCSV = useCallback((text: string) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const rows = lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = values[i] ?? "";
      });
      return row;
    });
    return rows.filter((r) => r.fabric_number);
  }, []);

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      setRowCount(rows.length);
      onParsed?.(rows);
    };
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50"
        }`}
      >
        <Upload className="mx-auto h-10 w-10 text-slate-400" />
        <p className="mt-4 text-sm font-medium text-slate-700">
          Drop {supplierName}&apos;s price list here
        </p>
        <p className="mt-1 text-xs text-slate-400">CSV or Excel exported as CSV</p>
        <label className="mt-4 inline-block cursor-pointer">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <span className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <FileSpreadsheet className="h-4 w-4" />
            Choose File
          </span>
        </label>
        {fileName && (
          <p className="mt-4 text-sm text-emerald-600">
            {fileName} — {rowCount} fabrics detected (preview only until Supabase is connected)
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Expected columns</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left font-medium text-slate-600">Column</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Required</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PRICE_LIST_IMPORT_COLUMNS.map((col) => (
                <tr key={col.key}>
                  <td className="px-3 py-2 font-mono text-slate-700">{col.key}</td>
                  <td className="px-3 py-2">{col.required ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Upload your supplier&apos;s price list as-is — I&apos;ll map the columns when you send the files.
          PDF and Excel files work too; just attach them in chat and I&apos;ll import them.
        </p>
      </div>
    </div>
  );
}
