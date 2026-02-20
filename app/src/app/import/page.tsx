"use client";

import { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface ImportConflict {
  type: "name_mismatch" | "email_mismatch" | "org_number_format" | "possible_wrong_org";
  shareholderName: string;
  orgNumber: string | null;
  details: string;
}

interface ImportResult {
  companyName?: string;
  companyOrgNumber?: string;
  shareholdersImported?: number;
  holdingsCreated?: number;
  conflicts?: ImportConflict[];
  error?: string;
}

export default function ImportPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".xlsx")) {
      setError("Only .xlsx files are supported");
      return;
    }

    setIsUploading(true);
    setResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Import failed");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError("Network error - could not reach the server");
    } finally {
      setIsUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          Import
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload shareholder register Excel exports from dcompany.no
        </p>
      </div>

      {/* Drop zone */}
      <Card>
        <CardContent className="pt-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
              isDragging
                ? "border-ecit-blue bg-ecit-blue/5"
                : "border-cream hover:border-sand"
            }`}
          >
            {isUploading ? (
              <>
                <div className="size-8 animate-spin rounded-full border-4 border-navy border-t-transparent" />
                <p className="text-sm font-medium text-navy">
                  Importing...
                </p>
              </>
            ) : (
              <>
                <div className="flex size-16 items-center justify-center rounded-full bg-beige">
                  <Upload className="size-7 text-navy/60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-navy">
                    Drag and drop an Excel file here
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    or click to browse
                  </p>
                </div>
                <label className="cursor-pointer rounded-md bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-light">
                  Choose File
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={handleInputChange}
                    className="hidden"
                  />
                </label>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card className={result.conflicts?.some(c => c.type === "possible_wrong_org") ? "border-ecit-red/30" : "border-positive/30"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-positive">
              <CheckCircle className="size-5" />
              Import Successful
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {result.companyName && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Company
                  </dt>
                  <dd className="mt-1 font-medium">{result.companyName}</dd>
                </div>
              )}
              {result.shareholdersImported != null && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Shareholders
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-navy">
                    {result.shareholdersImported}
                  </dd>
                </div>
              )}
              {result.holdingsCreated != null && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Holdings
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-navy">
                    {result.holdingsCreated}
                  </dd>
                </div>
              )}
              {result.conflicts != null && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Conflicts
                  </dt>
                  <dd className="mt-1 text-lg font-semibold">
                    {result.conflicts.length > 0 ? (
                      <span className="text-ecit-red">
                        {result.conflicts.length}
                      </span>
                    ) : (
                      <span className="text-positive">0</span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Conflict details */}
      {result?.conflicts && result.conflicts.length > 0 && (
        <Card className="border-ecit-red/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-ecit-red">
              <AlertTriangle className="size-5" />
              Data Quality Warnings
            </CardTitle>
            <CardDescription>
              Issues detected during import that may need review
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.conflicts
              .sort((a, b) => (a.type === "possible_wrong_org" ? -1 : 1) - (b.type === "possible_wrong_org" ? -1 : 1))
              .map((conflict, i) => (
              <div
                key={i}
                className={`rounded-md border px-4 py-3 text-sm ${
                  conflict.type === "possible_wrong_org"
                    ? "border-ecit-red/30 bg-ecit-red/5"
                    : "border-cream bg-beige-light"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                    conflict.type === "possible_wrong_org"
                      ? "bg-ecit-red/10 text-ecit-red"
                      : "bg-navy/10 text-navy"
                  }`}>
                    {conflict.type === "possible_wrong_org"
                      ? "Wrong Org Nr"
                      : conflict.type === "name_mismatch"
                        ? "Name Mismatch"
                        : conflict.type === "email_mismatch"
                          ? "Email Mismatch"
                          : "Format"}
                  </span>
                  <span className="font-medium text-navy">
                    {conflict.shareholderName}
                  </span>
                  {conflict.orgNumber && (
                    <span className="text-muted-foreground">
                      ({conflict.orgNumber})
                    </span>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {conflict.details}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-ecit-red/30">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="size-5 text-ecit-red" />
            <p className="text-sm text-ecit-red">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="size-4 text-ecit-blue" />
            Supported Format
          </CardTitle>
          <CardDescription>
            Excel exports from dcompany.no shareholder registers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 rounded-full bg-navy/30" />
              <span>
                Files must be <code className="text-xs">.xlsx</code> format
                exported from dcompany.no
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 rounded-full bg-navy/30" />
              <span>
                Both single share class and multi-class formats are supported
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 rounded-full bg-navy/30" />
              <span>
                Entity resolution will automatically match shareholders across
                companies by org number
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 rounded-full bg-navy/30" />
              <span>
                Conflicts (e.g. email mismatches) will be flagged for review in
                the Data Cleanup section
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
