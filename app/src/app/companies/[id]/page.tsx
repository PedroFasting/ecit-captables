import type { Metadata } from "next";
import { db } from "@/db";
import {
  companies,
  shareClasses,
  holdings,
  shareholders,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ShareholderTable } from "./shareholder-table";
import { CompanyTabs } from "./company-tabs";
import { DeleteCompanyDialog } from "./delete-company-dialog";
import { APP_LOCALE, formatPct, formatNumber } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      ownershipPct: string | null;
      votingPowerPct: string | null;
    }
  >();

  for (const row of holdingRows) {
    const existing = shareholderMap.get(row.shareholderId);
    if (existing) {
      existing.holdings.push(row);
      existing.totalShares += row.numShares ?? 0;
      // Ownership/voting % are shareholder-level (not per-class), pick first non-null
      if (!existing.ownershipPct && row.ownershipPct) existing.ownershipPct = row.ownershipPct;
      if (!existing.votingPowerPct && row.votingPowerPct) existing.votingPowerPct = row.votingPowerPct;
    } else {
      shareholderMap.set(row.shareholderId, {
        id: row.shareholderId,
        name: row.shareholderName,
        orgNumber: row.shareholderOrgNumber,
        entityType: row.entityType,
        country: row.country,
        holdings: [row],
        totalShares: row.numShares ?? 0,
        ownershipPct: row.ownershipPct,
        votingPowerPct: row.votingPowerPct,
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-navy">
              {data.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Org. {data.orgNumber}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`https://www.proff.no/selskap/-/-/${data.orgNumber.replace(/\s/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-cream px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-beige"
            >
              Proff.no <ExternalLink className="size-3" />
            </a>
            <DeleteCompanyDialog
              companyId={data.id}
              companyName={data.name}
              orgNumber={data.orgNumber}
            />
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
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
            <div className="overflow-x-auto">
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabbed Content: Shareholders + History */}
      <CompanyTabs
        companyId={data.id}
        shareholdersContent={
          <ShareholderTable
            shareholders={data.shareholders.map((sh) => ({
              ...sh,
              holdings: sh.holdings.map((h) => ({
                holdingId: h.holdingId,
                shareClassId: h.shareClassId,
                shareClassName: h.shareClassName,
                numShares: h.numShares,
              })),
            }))}
            shareClasses={data.shareClasses.map((sc) => ({
              id: sc.id,
              name: sc.name,
            }))}
          />
        }
      />
    </div>
  );
}
