"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Calendar,
  Filter,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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

interface Transaction {
  id: string;
  type: string;
  effectiveDate: string;
  description: string | null;
  fromShareholderId: string | null;
  fromShareholderName: string | null;
  toShareholderId: string | null;
  toShareholderName: string | null;
  shareClassId: string | null;
  shareClassName: string | null;
  numShares: number;
  pricePerShare: string | null;
  totalAmount: string | null;
  sharesBefore: number | null;
  sharesAfter: number | null;
  source: string;
  importBatchId: string | null;
  documentReference: string | null;
  createdAt: string;
}

// ── Transaction Type Labels ────────────────────────────

const typeLabels: Record<string, { label: string; color: string }> = {
  import_diff: { label: "Import", color: "bg-ecit-blue/10 text-ecit-blue" },
  founding: { label: "Stiftelse", color: "bg-navy/10 text-navy" },
  emission: { label: "Emisjon", color: "bg-positive/10 text-positive" },
  write_down: { label: "Nedskriving", color: "bg-ecit-red/10 text-ecit-red" },
  sale_transfer: { label: "Salg/Overdragelse", color: "bg-amber-50 text-amber-700" },
  inheritance: { label: "Arv", color: "bg-purple-50 text-purple-700" },
  gift: { label: "Gave", color: "bg-pink-50 text-pink-700" },
  split: { label: "Splitt", color: "bg-sky-50 text-sky-700" },
  reverse_split: { label: "Omvendt splitt", color: "bg-sky-50 text-sky-700" },
  conversion: { label: "Konvertering", color: "bg-indigo-50 text-indigo-700" },
  redemption: { label: "Innløsning", color: "bg-ecit-red/10 text-ecit-red" },
  merger: { label: "Fusjon", color: "bg-teal-50 text-teal-700" },
  demerger: { label: "Fisjon", color: "bg-teal-50 text-teal-700" },
  manual_adjustment: { label: "Manuell justering", color: "bg-gray-100 text-gray-700" },
};

// ── Component ──────────────────────────────────────────

export function TransactionHistory({ companyId }: { companyId: string }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/companies/${companyId}/transactions?limit=100`
        );
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to load transactions");
          return;
        }

        setTransactions(data.transactions);
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [companyId]);

  // Derive available types from loaded transactions
  const availableTypes = useMemo(() => {
    const types = new Map<string, number>();
    for (const t of transactions) {
      types.set(t.type, (types.get(t.type) ?? 0) + 1);
    }
    return Array.from(types.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));
  }, [transactions]);

  // Apply filter
  const filtered = useMemo(
    () =>
      typeFilter
        ? transactions.filter((t) => t.type === typeFilter)
        : transactions,
    [transactions, typeFilter]
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-navy/40" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-ecit-red/30">
        <CardContent className="pt-6 text-sm text-ecit-red">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No transactions recorded yet.
        </CardContent>
      </Card>
    );
  }

  // Group by date
  const grouped = groupByDate(filtered);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowRightLeft className="size-4 text-ecit-blue" />
            Transaksjonshistorikk
          </CardTitle>
          <CardDescription>
            {typeFilter
              ? `${filtered.length} av ${transactions.length} transaksjoner (filtrert)`
              : `${transactions.length} transaksjon${transactions.length !== 1 ? "er" : ""} registrert`}
          </CardDescription>
        </CardHeader>

        {/* Type filter */}
        {availableTypes.length > 1 && (
          <div className="px-6 pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Filter className="mr-1 size-3 text-muted-foreground" />
              <button
                onClick={() => setTypeFilter(null)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  typeFilter === null
                    ? "border-ecit-blue bg-ecit-blue/10 text-ecit-blue"
                    : "border-border bg-background text-muted-foreground hover:bg-accent"
                }`}
              >
                Alle
              </button>
              {availableTypes.map(({ type, count }) => {
                const info = typeLabels[type] ?? {
                  label: type,
                  color: "bg-gray-100 text-gray-700",
                };
                return (
                  <button
                    key={type}
                    onClick={() =>
                      setTypeFilter(typeFilter === type ? null : type)
                    }
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      typeFilter === type
                        ? "border-ecit-blue bg-ecit-blue/10 text-ecit-blue"
                        : "border-border bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {info.label}{" "}
                    <span className="ml-0.5 opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <CardContent>
          {filtered.length === 0 && typeFilter ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Ingen transaksjoner av denne typen.
            </p>
          ) : (
          <div className="space-y-6">
            {grouped.map(({ date, txns }) => (
              <div key={date}>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Calendar className="size-3" />
                  {formatDate(date)}
                </div>
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Type</TableHead>
                      <TableHead>Beskrivelse</TableHead>
                      <TableHead className="hidden sm:table-cell">Aksjeslag</TableHead>
                      <TableHead className="text-right">Aksjer</TableHead>
                      <TableHead className="hidden md:table-cell text-right">Før</TableHead>
                      <TableHead className="hidden md:table-cell text-right">Etter</TableHead>
                      <TableHead className="hidden lg:table-cell">Kilde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {txns.map((t) => {
                      const typeInfo = typeLabels[t.type] ?? {
                        label: t.type,
                        color: "bg-gray-100 text-gray-700",
                      };
                      return (
                        <TableRow key={t.id}>
                          <TableCell>
                            <Badge className={typeInfo.color}>
                              {typeInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate text-sm">
                            {t.description ?? "—"}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                            {t.shareClassName ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {t.numShares.toLocaleString("nb-NO")}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-right font-mono text-sm text-muted-foreground">
                            {t.sharesBefore?.toLocaleString("nb-NO") ?? "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-right font-mono text-sm">
                            {t.sharesAfter?.toLocaleString("nb-NO") ?? "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <SourceBadge source={t.source} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              </div>
            ))}
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────

function groupByDate(txns: Transaction[]) {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    const date = t.effectiveDate;
    const group = groups.get(date) ?? [];
    group.push(t);
    groups.set(date, group);
  }
  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, txns]) => ({ date, txns }));
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("nb-NO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function SourceBadge({ source }: { source: string }) {
  const config: Record<string, { label: string; className: string }> = {
    import: { label: "Import", className: "bg-ecit-blue/10 text-ecit-blue" },
    manual: { label: "Manuell", className: "bg-navy/10 text-navy" },
    pdf: { label: "PDF", className: "bg-purple-50 text-purple-700" },
  };
  const c = config[source] ?? { label: source, className: "bg-gray-100 text-gray-700" };
  return <Badge className={c.className}>{c.label}</Badge>;
}
