"use client";

import { useState, useCallback } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Eye,
  Loader2,
  Plus,
  Minus,
  Equal,
  UserMinus,
  UserPlus,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Types ──────────────────────────────────────────────

interface ImportConflict {
  type:
    | "name_mismatch"
    | "email_mismatch"
    | "org_number_format"
    | "possible_wrong_org";
  shareholderName: string;
  orgNumber: string | null;
  details: string;
}

interface ShareClassChange {
  type: "added" | "removed" | "changed" | "unchanged";
  name: string;
  before?: { totalShares: number | null; nominalValue: string | null; shareCapital: string | null };
  after?: { totalShares: number | null; nominalValue: string | null; shareCapital: string | null };
}

interface HoldingChange {
  shareClassName: string;
  sharesBefore: number;
  sharesAfter: number;
  ownershipPctBefore: number;
  ownershipPctAfter: number;
}

interface ShareholderChange {
  type: "new" | "exited" | "increased" | "decreased" | "class_changed" | "unchanged";
  shareholderName: string;
  shareholderId?: string;
  orgNumber?: string | null;
  holdingChanges: HoldingChange[];
  totalSharesBefore: number;
  totalSharesAfter: number;
  ownershipPctBefore: number;
  ownershipPctAfter: number;
}

interface ImportDiff {
  companyName: string;
  companyOrgNumber: string;
  isFirstImport: boolean;
  shareClassChanges: ShareClassChange[];
  shareholderChanges: ShareholderChange[];
  summary: {
    newShareholders: number;
    exitedShareholders: number;
    changedHoldings: number;
    unchangedHoldings: number;
    newShareClasses: number;
    removedShareClasses: number;
    changedShareClasses: number;
  };
}

interface PreviewResult {
  diff: ImportDiff;
  existingCompanyId: string | null;
}

interface ConfirmResult {
  companyName: string;
  companyOrgNumber: string;
  shareholdersImported: number;
  holdingsCreated: number;
  conflicts: ImportConflict[];
  snapshotId: string | null;
  transactionsCreated: number;
  diff: ImportDiff;
}

type Step = "upload" | "preview" | "result";

// ── Main Page Component ────────────────────────────────

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── File handling ──────────────────────────────────

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.endsWith(".xlsx")) {
      setError("Only .xlsx files are supported");
      return;
    }

    setFile(f);
    setError(null);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", f);

      const res = await fetch("/api/import/preview", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Preview failed");
        setIsLoading(false);
        return;
      }

      setPreview(data);

      // Skip preview for first import — go straight to confirm
      if (data.diff.isFirstImport) {
        await doConfirmImport(f);
      } else {
        setStep("preview");
        setIsLoading(false);
      }
    } catch {
      setError("Network error - could not reach the server");
      setIsLoading(false);
    }
  }, []);

  async function doConfirmImport(f: File) {
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", f);

      const res = await fetch("/api/import?confirmed=true", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Import failed");
      } else {
        setResult(data);
        setStep("result");
      }
    } catch {
      setError("Network error - could not reach the server");
    } finally {
      setIsLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function handleReset() {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  // ── Render ─────────────────────────────────────────

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

      {/* Stepper */}
      <StepIndicator current={step} />

      {/* Error */}
      {error && (
        <Card className="border-ecit-red/30">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="size-5 text-ecit-red" />
            <p className="text-sm text-ecit-red">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Step: Upload */}
      {step === "upload" && (
        <>
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
                {isLoading ? (
                  <>
                    <Loader2 className="size-8 animate-spin text-navy/60" />
                    <p className="text-sm font-medium text-navy">
                      Analysing file...
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
                  Files must be <code className="text-xs">.xlsx</code> format
                  exported from dcompany.no
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 size-1.5 rounded-full bg-navy/30" />
                  Re-imports will show a preview of changes before applying
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 size-1.5 rounded-full bg-navy/30" />
                  A snapshot of the current state is saved automatically
                </li>
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      {/* Step: Preview */}
      {step === "preview" && preview && (
        <>
          <DiffPreview diff={preview.diff} />

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleReset}>
              <ArrowLeft className="mr-2 size-4" />
              Cancel
            </Button>
            <Button
              onClick={() => file && doConfirmImport(file)}
              disabled={isLoading}
              className="bg-navy text-white hover:bg-navy-light"
            >
              {isLoading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 size-4" />
              )}
              Confirm Import
            </Button>
          </div>
        </>
      )}

      {/* Step: Result */}
      {step === "result" && result && (
        <>
          <ImportResultCard result={result} />

          {result.conflicts.length > 0 && (
            <ConflictsCard conflicts={result.conflicts} />
          )}

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleReset}>
              Import Another File
            </Button>
            <Button asChild className="bg-navy text-white hover:bg-navy-light">
              <a href={`/companies`}>
                View Companies
                <ArrowRight className="ml-2 size-4" />
              </a>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Step Indicator ─────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string; icon: typeof Upload }[] = [
    { key: "upload", label: "Upload", icon: Upload },
    { key: "preview", label: "Preview", icon: Eye },
    { key: "result", label: "Result", icon: CheckCircle },
  ];

  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-3">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;

        return (
          <div key={s.key} className="flex items-center gap-3">
            {i > 0 && (
              <div
                className={`h-px w-8 ${isDone ? "bg-navy" : "bg-cream"}`}
              />
            )}
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-navy text-white"
                  : isDone
                    ? "bg-navy/10 text-navy"
                    : "bg-beige text-muted-foreground"
              }`}
            >
              {isDone ? (
                <CheckCircle className="size-3.5" />
              ) : (
                <Icon className="size-3.5" />
              )}
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Diff Preview ───────────────────────────────────────

function DiffPreview({ diff }: { diff: ImportDiff }) {
  const { summary } = diff;
  const hasChanges =
    summary.newShareholders > 0 ||
    summary.exitedShareholders > 0 ||
    summary.changedHoldings > 0 ||
    summary.newShareClasses > 0 ||
    summary.removedShareClasses > 0 ||
    summary.changedShareClasses > 0;

  return (
    <div className="space-y-4">
      {/* Company header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {diff.companyName}
          </CardTitle>
          <CardDescription>{diff.companyOrgNumber}</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasChanges ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Equal className="size-4" />
              No changes detected — data matches current state
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryBadge
                label="New shareholders"
                count={summary.newShareholders}
                variant="positive"
              />
              <SummaryBadge
                label="Exited shareholders"
                count={summary.exitedShareholders}
                variant="destructive"
              />
              <SummaryBadge
                label="Changed holdings"
                count={summary.changedHoldings}
                variant="warning"
              />
              <SummaryBadge
                label="Unchanged"
                count={summary.unchangedHoldings}
                variant="neutral"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Share class changes */}
      {diff.shareClassChanges.some((c) => c.type !== "unchanged") && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Share Class Changes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Shares Before</TableHead>
                  <TableHead className="text-right">Shares After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diff.shareClassChanges
                  .filter((c) => c.type !== "unchanged")
                  .map((c) => (
                    <TableRow
                      key={c.name}
                      className={changeRowClass(c.type)}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <ChangeTypeBadge type={c.type} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {c.before?.totalShares?.toLocaleString("nb-NO") ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {c.after?.totalShares?.toLocaleString("nb-NO") ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Shareholder changes */}
      {diff.shareholderChanges.some((c) => c.type !== "unchanged") && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Shareholder Changes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shareholder</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Shares Before</TableHead>
                  <TableHead className="text-right">Shares After</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diff.shareholderChanges
                  .filter((c) => c.type !== "unchanged")
                  .map((c, i) => (
                    <TableRow key={i} className={shareholderRowClass(c.type)}>
                      <TableCell>
                        <div>
                          <span className="font-medium">
                            {c.shareholderName}
                          </span>
                          {c.orgNumber && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {c.orgNumber}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ShareholderTypeBadge type={c.type} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {c.totalSharesBefore.toLocaleString("nb-NO")}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {c.totalSharesAfter.toLocaleString("nb-NO")}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <SharesDelta
                          before={c.totalSharesBefore}
                          after={c.totalSharesAfter}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>

            {/* Unchanged count */}
            {diff.summary.unchangedHoldings > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                + {diff.summary.unchangedHoldings} unchanged shareholder
                {diff.summary.unchangedHoldings !== 1 ? "s" : ""} not shown
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Result Card ────────────────────────────────────────

function ImportResultCard({ result }: { result: ConfirmResult }) {
  return (
    <Card className="border-positive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-positive">
          <CheckCircle className="size-5" />
          Import Successful
        </CardTitle>
        <CardDescription>
          {result.companyName} ({result.companyOrgNumber})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Shareholders
            </dt>
            <dd className="mt-1 text-lg font-semibold text-navy">
              {result.shareholdersImported}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Holdings
            </dt>
            <dd className="mt-1 text-lg font-semibold text-navy">
              {result.holdingsCreated}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Transactions
            </dt>
            <dd className="mt-1 text-lg font-semibold text-navy">
              {result.transactionsCreated}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Snapshot
            </dt>
            <dd className="mt-1 text-lg font-semibold text-navy">
              {result.snapshotId ? "Saved" : "First import"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Conflicts
            </dt>
            <dd className="mt-1 text-lg font-semibold">
              {result.conflicts.length > 0 ? (
                <span className="text-ecit-red">{result.conflicts.length}</span>
              ) : (
                <span className="text-positive">0</span>
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

// ── Conflicts Card ─────────────────────────────────────

function ConflictsCard({ conflicts }: { conflicts: ImportConflict[] }) {
  return (
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
        {conflicts
          .sort(
            (a, b) =>
              (a.type === "possible_wrong_org" ? -1 : 1) -
              (b.type === "possible_wrong_org" ? -1 : 1)
          )
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
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                    conflict.type === "possible_wrong_org"
                      ? "bg-ecit-red/10 text-ecit-red"
                      : "bg-navy/10 text-navy"
                  }`}
                >
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
              <p className="mt-1 text-muted-foreground">{conflict.details}</p>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

// ── Helper Components ──────────────────────────────────

function SummaryBadge({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: "positive" | "destructive" | "warning" | "neutral";
}) {
  if (count === 0) return null;

  const colors = {
    positive: "bg-positive/10 text-positive border-positive/20",
    destructive: "bg-ecit-red/10 text-ecit-red border-ecit-red/20",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    neutral: "bg-beige text-muted-foreground border-cream",
  };

  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[variant]}`}>
      <div className="text-lg font-semibold">{count}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

function ChangeTypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; className: string }> = {
    added: { label: "New", className: "bg-positive/10 text-positive" },
    removed: { label: "Removed", className: "bg-ecit-red/10 text-ecit-red" },
    changed: { label: "Changed", className: "bg-amber-50 text-amber-700" },
    unchanged: { label: "Unchanged", className: "bg-beige text-muted-foreground" },
  };
  const c = config[type] ?? config.unchanged;
  return <Badge className={c.className}>{c.label}</Badge>;
}

function ShareholderTypeBadge({ type }: { type: ShareholderChange["type"] }) {
  const config: Record<
    string,
    { label: string; className: string; icon: typeof Plus }
  > = {
    new: { label: "New", className: "bg-positive/10 text-positive", icon: UserPlus },
    exited: { label: "Exited", className: "bg-ecit-red/10 text-ecit-red", icon: UserMinus },
    increased: { label: "Increased", className: "bg-positive/10 text-positive", icon: Plus },
    decreased: { label: "Decreased", className: "bg-ecit-red/10 text-ecit-red", icon: Minus },
    class_changed: { label: "Class Changed", className: "bg-amber-50 text-amber-700", icon: ArrowRight },
    unchanged: { label: "Unchanged", className: "bg-beige text-muted-foreground", icon: Equal },
  };
  const c = config[type] ?? config.unchanged;
  const Icon = c.icon;
  return (
    <Badge className={`gap-1 ${c.className}`}>
      <Icon className="size-3" />
      {c.label}
    </Badge>
  );
}

function SharesDelta({ before, after }: { before: number; after: number }) {
  const delta = after - before;
  if (delta === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={delta > 0 ? "text-positive" : "text-ecit-red"}>
      {delta > 0 ? "+" : ""}
      {delta.toLocaleString("nb-NO")}
    </span>
  );
}

function changeRowClass(type: string): string {
  switch (type) {
    case "added": return "bg-positive/5";
    case "removed": return "bg-ecit-red/5";
    case "changed": return "bg-amber-50/50";
    default: return "";
  }
}

function shareholderRowClass(type: string): string {
  switch (type) {
    case "new": return "bg-positive/5";
    case "exited": return "bg-ecit-red/5";
    case "increased":
    case "decreased":
    case "class_changed": return "bg-amber-50/50";
    default: return "";
  }
}
