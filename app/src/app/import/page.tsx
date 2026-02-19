"use client";

import { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface ImportResult {
  company?: string;
  shareholdersImported?: number;
  holdingsImported?: number;
  conflictsFound?: number;
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
        <Card className="border-positive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-positive">
              <CheckCircle className="size-5" />
              Import Successful
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {result.company && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Company
                  </dt>
                  <dd className="mt-1 font-medium">{result.company}</dd>
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
              {result.holdingsImported != null && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Holdings
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-navy">
                    {result.holdingsImported}
                  </dd>
                </div>
              )}
              {result.conflictsFound != null && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Conflicts
                  </dt>
                  <dd className="mt-1 text-lg font-semibold">
                    {result.conflictsFound > 0 ? (
                      <span className="text-ecit-red">
                        {result.conflictsFound}
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
