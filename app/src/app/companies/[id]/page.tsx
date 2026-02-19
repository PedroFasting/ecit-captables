import type { Metadata } from "next";
import { db } from "@/db";
import {
  companies,
  shareClasses,
  holdings,
  shareholders,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Users, ExternalLink } from "lucide-react";
import { APP_LOCALE } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const company = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);

  return {
    title: company[0]
      ? `${company[0].name} | ECIT Cap Tables`
      : "Company Not Found | ECIT Cap Tables",
  };
}
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

async function getCompanyDetail(id: string) {
  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);

  if (company.length === 0) return null;

  const classes = await db
    .select()
    .from(shareClasses)
    .where(eq(shareClasses.companyId, id));

  const holdingRows = await db
    .select({
      holdingId: holdings.id,
      shareholderId: shareholders.id,
      shareholderName: shareholders.canonicalName,
      shareholderOrgNumber: shareholders.orgNumber,
      entityType: shareholders.entityType,
      country: shareholders.country,
      shareClassId: holdings.shareClassId,
      shareClassName: shareClasses.name,
      numShares: holdings.numShares,
      ownershipPct: holdings.ownershipPct,
      votingPowerPct: holdings.votingPowerPct,
      entryDate: holdings.entryDate,
      isPledged: holdings.isPledged,
    })
    .from(holdings)
    .innerJoin(shareholders, eq(holdings.shareholderId, shareholders.id))
    .leftJoin(shareClasses, eq(holdings.shareClassId, shareClasses.id))
    .where(eq(holdings.companyId, id))
    .orderBy(shareholders.canonicalName);

  // Group by shareholder
  const shareholderMap = new Map<
    string,
    {
      id: string;
      name: string;
      orgNumber: string | null;
      entityType: string;
      country: string | null;
      holdings: typeof holdingRows;
      totalShares: number;
      totalOwnershipPct: number;
    }
  >();

  for (const row of holdingRows) {
    const existing = shareholderMap.get(row.shareholderId);
    if (existing) {
      existing.holdings.push(row);
      existing.totalShares += row.numShares ?? 0;
      existing.totalOwnershipPct += parseFloat(row.ownershipPct ?? "0");
    } else {
      shareholderMap.set(row.shareholderId, {
        id: row.shareholderId,
        name: row.shareholderName,
        orgNumber: row.shareholderOrgNumber,
        entityType: row.entityType,
        country: row.country,
        holdings: [row],
        totalShares: row.numShares ?? 0,
        totalOwnershipPct: parseFloat(row.ownershipPct ?? "0"),
      });
    }
  }

  return {
    ...company[0],
    shareClasses: classes,
    shareholders: Array.from(shareholderMap.values()).sort(
      (a, b) => b.totalShares - a.totalShares
    ),
  };
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

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCompanyDetail(id);

  if (!data) notFound();

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <div>
        <Link
          href="/companies"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
        >
          <ArrowLeft className="size-3" />
          Back to Companies
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-navy">
              {data.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Org. {data.orgNumber}
            </p>
          </div>
          <a
            href={`https://www.proff.no/selskap/-/-/${data.orgNumber.replace(/\s/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-cream px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-beige"
          >
            Proff.no <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Share Capital
            </p>
            <p className="mt-1 text-xl font-semibold text-navy">
              {data.shareCapital
                ? `NOK ${parseFloat(data.shareCapital).toLocaleString(APP_LOCALE)}`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Shares
            </p>
            <p className="mt-1 text-xl font-semibold text-navy">
              {formatNumber(data.totalShares)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Share Classes
            </p>
            <p className="mt-1 text-xl font-semibold text-navy">
              {data.shareClasses.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Shareholders
            </p>
            <p className="mt-1 text-xl font-semibold text-navy">
              {data.shareholders.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Share Classes */}
      {data.shareClasses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Share Classes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Total Shares</TableHead>
                  <TableHead className="text-right">Nominal Value</TableHead>
                  <TableHead className="text-right">Share Capital</TableHead>
                  <TableHead className="text-right">Total Votes</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.shareClasses.map((sc) => (
                  <TableRow key={sc.id}>
                    <TableCell className="font-medium">{sc.name}</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(sc.totalShares)}
                    </TableCell>
                    <TableCell className="text-right">
                      {sc.nominalValue ? parseFloat(sc.nominalValue).toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {sc.shareCapital
                        ? parseFloat(sc.shareCapital).toLocaleString(APP_LOCALE)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(sc.totalVotes)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {sc.remarks || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Shareholders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shareholders</CardTitle>
          <CardDescription>
            {data.shareholders.length} shareholders sorted by number of shares
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shareholder</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Ownership</TableHead>
                <TableHead>Share Classes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.shareholders.map((sh) => (
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
                  <TableCell className="text-right">
                    {formatPct(sh.totalOwnershipPct)}
                  </TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
