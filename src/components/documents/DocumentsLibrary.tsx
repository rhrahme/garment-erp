"use client";

import Link from "next/link";
import { Cloud, Database, ExternalLink, FileText, FolderOpen, HardDrive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatDataSize, type DocumentsLibrarySnapshot } from "@/lib/data/documents-library";
import { formatDate } from "@/lib/utils";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDate(iso.slice(0, 10)) + " " + iso.slice(11, 16);
  } catch {
    return iso;
  }
}

export function DocumentsLibrary({ snapshot }: { snapshot: DocumentsLibrarySnapshot }) {
  const catalogFabrics = snapshot.priceCatalogs.reduce((sum, row) => sum + row.fabricCount, 0);
  const scannedFiles = snapshot.scannedFiles.reduce((sum, row) => sum + row.fileCount, 0);
  const scannedBytes = snapshot.scannedFiles.reduce((sum, row) => sum + row.totalBytes, 0);
  const referenceBytes = snapshot.referenceSourceFiles.reduce((sum, row) => sum + row.fileBytes, 0);
  const referenceOnDisk = snapshot.referenceSourceFiles.filter((row) => row.existsOnDisk).length;

  function importStatusLabel(status: string): string {
    if (status === "imported") return "Imported";
    if (status === "archived") return "Archived";
    return status;
  }

  function importStatusClass(status: string): string {
    if (status === "imported") return "bg-emerald-50 text-emerald-700";
    if (status === "archived") return "bg-slate-100 text-slate-600";
    return "bg-amber-50 text-amber-700";
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              {snapshot.storageMode === "supabase" ? <Cloud className="h-5 w-5" /> : <HardDrive className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Live storage</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {snapshot.storageMode === "supabase" ? "Supabase cloud" : "Local JSON"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {snapshot.storageMode === "supabase"
                  ? "Business data synced to erp_documents"
                  : "Set SUPABASE_SERVICE_ROLE_KEY to enable cloud sync"}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">ERP datasets</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{snapshot.erpDocumentCount}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDataSize(snapshot.totalErpBytes)} total</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Price catalogs</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{snapshot.priceCatalogs.length}</p>
              <p className="mt-1 text-xs text-slate-500">{catalogFabrics.toLocaleString()} fabric lines</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Scanned PDFs</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{scannedFiles}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDataSize(scannedBytes)} on disk</p>
            </div>
          </div>
        </Card>
      </div>

      {snapshot.categories.map((category) => (
        <section key={category.id}>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">{category.label}</h2>
            <p className="text-sm text-slate-500">{category.description}</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Dataset</th>
                  <th className="px-4 py-3">Records</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Last updated</th>
                  <th className="px-4 py-3">Source file</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {category.documents.map((doc) => (
                  <tr key={doc.key} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-slate-900">{doc.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{doc.description}</p>
                    </td>
                    <td className="px-4 py-3 align-top font-medium text-slate-800">{doc.recordSummary}</td>
                    <td className="px-4 py-3 align-top text-slate-600">{formatDataSize(doc.approximateBytes)}</td>
                    <td className="px-4 py-3 align-top text-slate-600">
                      {formatWhen(doc.supabaseUpdatedAt ?? doc.updatedAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{doc.sourcePath}</code>
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      {doc.appHref ? (
                        <Link
                          href={doc.appHref}
                          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                        >
                          Open
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Reference price catalogs</h2>
          <p className="text-sm text-slate-500">
            Supplier PDFs you imported — used in Fabric Specification for fabric search and pricing
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">List</th>
                <th className="px-4 py-3">Fabrics</th>
                <th className="px-4 py-3">Original file</th>
                <th className="px-4 py-3">Imported</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {snapshot.priceCatalogs.map((catalog) => (
                <tr key={catalog.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{catalog.supplierName}</td>
                  <td className="px-4 py-3 text-slate-700">{catalog.priceListName}</td>
                  <td className="px-4 py-3 text-slate-700">{catalog.fabricCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-600">{catalog.sourceFile ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{formatWhen(catalog.importedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={catalog.appHref}
                      className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      Fabric spec
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Original supplier source files</h2>
          <p className="text-sm text-slate-500">
            Price lists and product info copied from Desktop — {referenceOnDisk} files ·{" "}
            {formatDataSize(referenceBytes)} on disk
            {snapshot.referenceSourceUpdatedAt
              ? ` · catalog updated ${formatWhen(snapshot.referenceSourceUpdatedAt)}`
              : null}
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Catalog</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {snapshot.referenceSourceFiles.map((file) => (
                <tr key={file.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{file.supplier}</td>
                  <td className="px-4 py-3 align-top">
                    <p className="text-slate-800">{file.filename}</p>
                    {file.notes ? <p className="mt-0.5 text-xs text-slate-500">{file.notes}</p> : null}
                    {!file.existsOnDisk ? (
                      <p className="mt-0.5 text-xs text-rose-600">Missing from reference-documents/</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600">{file.type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${importStatusClass(file.importStatus)}`}
                    >
                      {importStatusLabel(file.importStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{file.catalogId ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {file.existsOnDisk ? formatDataSize(file.fileBytes) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {file.existsOnDisk ? (
                      <a
                        href={file.downloadHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Open
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Scanned document files</h2>
          <p className="text-sm text-slate-500">PDF attachments saved locally from supplier inbox scan</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {snapshot.scannedFiles.map((group) => (
            <Card key={group.id}>
              <CardHeader>
                <CardTitle className="text-base">{group.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-600">
                <p>{group.description}</p>
                <p>
                  <span className="font-medium text-slate-900">{group.fileCount}</span> files ·{" "}
                  {formatDataSize(group.totalBytes)}
                </p>
                <p>
                  Folder: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{group.folderPath}</code>
                </p>
                <Link href={group.appHref} className="inline-flex items-center gap-1 font-medium text-indigo-600">
                  View in app
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
