"use client";

import { useState } from "react";
import Link from "next/link";
import { Layers, Filter } from "lucide-react";
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
import { APP_LOCALE } from "@/lib/utils";

interface Holding {
  holdingId: string;
  shareClassId: string | null;
  shareClassName: string | null;
  numShares: number | null;
}

interface Shareholder {
  id: string;
  name: string;
  orgNumber: string | null;
  entityType: string;
  country: string | null;
  holdings: Holding[];
  totalShares: number;
  ownershipPct: string | null;
  votingPowerPct: string | null;
}

interface ShareClass {
  id: string;
  name: string;
}

function formatPct(pct: number | string | null | undefined): string {
  if (pct == null) return "—";
  const n = typeof pct === "string" ? parseFloat(pct) : pct;
  if (isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString(APP_LOCALE);
}

export function ShareholderTable({
  shareholders,
  shareClasses,
}: {
  shareholders: Shareholder[];
  shareClasses: ShareClass[];
}) {
  const [filter, setFilter] = useState<string | null>(null);

  // Only show filter if there are multiple share classes
  const showFilter = shareClasses.length > 1;

  // Filter and recompute shares when a class is selected
  const filtered = filter
    ? shareholders
        .map((sh) => {
          const matchingHoldings = sh.holdings.filter(
            (h) => h.shareClassId === filter
          );
          if (matchingHoldings.length === 0) return null;
          const classShares = matchingHoldings.reduce(
            (sum, h) => sum + (h.numShares ?? 0),
            0
          );
          return { ...sh, holdings: matchingHoldings, totalShares: classShares };
        })
        .filter(Boolean as unknown as (v: Shareholder | null) => v is Shareholder)
        .sort((a, b) => b.totalShares - a.totalShares)
    : shareholders;

  const activeClassName = filter
    ? shareClasses.find((sc) => sc.id === filter)?.name ?? "Filtered"
    : "All Classes";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Shareholders</CardTitle>
            <CardDescription>
              {filtered.length} shareholder{filtered.length !== 1 ? "s" : ""}{" "}
              {filter ? `holding ${activeClassName}` : "sorted by number of shares"}
            </CardDescription>
          </div>
          {showFilter && (
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label="Filter by share class"
            >
              <button
                onClick={() => setFilter(null)}
                aria-pressed={filter === null}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ecit-blue focus-visible:ring-offset-2 ${
                  filter === null
                    ? "bg-navy text-white"
                    : "border border-cream text-muted-foreground hover:bg-beige"
                }`}
              >
                <span className="flex items-center gap-1">
                  <Layers className="size-3" />
                  All
                </span>
              </button>
              {shareClasses.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => setFilter(sc.id)}
                  aria-pressed={filter === sc.id}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ecit-blue focus-visible:ring-offset-2 ${
                    filter === sc.id
                      ? "bg-navy text-white"
                      : "border border-cream text-muted-foreground hover:bg-beige"
                  }`}
                >
                  {sc.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shareholder</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              {!filter && (
                <>
                  <TableHead className="text-right">Ownership</TableHead>
                  <TableHead className="text-right">Voting Power</TableHead>
                </>
              )}
              {!filter && <TableHead>Share Classes</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={filter ? 3 : 6}
                  className="py-8 text-center text-muted-foreground"
                >
                  No shareholders found for this share class.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((sh) => (
                <TableRow key={sh.id}>
                  <TableCell>
                    <Link
                      href={`/shareholders/${sh.id}`}
                      className="font-medium text-navy hover:underline"
                    >
                      {sh.name}
                    </Link>
                    {sh.orgNumber && (
                      <p className="text-xs text-muted-foreground">
                        {sh.orgNumber}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {sh.entityType === "company" ? "Company" : "Person"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatNumber(sh.totalShares)}
                  </TableCell>
                  {!filter && (
                    <>
                      <TableCell className="text-right">
                        {formatPct(sh.ownershipPct)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPct(sh.votingPowerPct)}
                      </TableCell>
                    </>
                  )}
                  {!filter && (
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {sh.holdings.map((h) => (
                          <Badge
                            key={h.holdingId}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {h.shareClassName || "Common"}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
