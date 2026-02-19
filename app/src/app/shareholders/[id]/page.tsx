import type { Metadata } from "next";
import { db } from "@/db";
import {
  shareholders,
  shareholderAliases,
  shareholderContacts,
  holdings,
  companies,
  shareClasses,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, User, Mail, Phone, MapPin } from "lucide-react";
import { APP_LOCALE } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const shareholder = await db
    .select({ name: shareholders.canonicalName })
    .from(shareholders)
    .where(eq(shareholders.id, id))
    .limit(1);

  return {
    title: shareholder[0]
      ? `${shareholder[0].name} | ECIT Cap Tables`
      : "Shareholder Not Found | ECIT Cap Tables",
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

async function getShareholderDetail(id: string) {
  const shareholder = await db
    .select()
    .from(shareholders)
    .where(eq(shareholders.id, id))
    .limit(1);

  if (shareholder.length === 0) return null;

  const aliases = await db
    .select({
      id: shareholderAliases.id,
      nameVariant: shareholderAliases.nameVariant,
      email: shareholderAliases.email,
      sourceCompanyName: companies.name,
    })
    .from(shareholderAliases)
    .leftJoin(companies, eq(shareholderAliases.sourceCompanyId, companies.id))
    .where(eq(shareholderAliases.shareholderId, id));

  const contacts = await db
    .select()
    .from(shareholderContacts)
    .where(eq(shareholderContacts.shareholderId, id));

  const holdingRows = await db
    .select({
      holdingId: holdings.id,
      companyId: companies.id,
      companyName: companies.name,
      companyOrgNumber: companies.orgNumber,
      shareClassName: shareClasses.name,
      numShares: holdings.numShares,
      ownershipPct: holdings.ownershipPct,
      votingPowerPct: holdings.votingPowerPct,
      entryDate: holdings.entryDate,
      isPledged: holdings.isPledged,
    })
    .from(holdings)
    .innerJoin(companies, eq(holdings.companyId, companies.id))
    .leftJoin(shareClasses, eq(holdings.shareClassId, shareClasses.id))
    .where(eq(holdings.shareholderId, id))
    .orderBy(companies.name);

  // Group by company
  const companiesMap = new Map<
    string,
    {
      id: string;
      name: string;
      orgNumber: string;
      holdings: typeof holdingRows;
      totalShares: number;
      ownershipPct: string | null;
      votingPowerPct: string | null;
    }
  >();

  for (const row of holdingRows) {
    const existing = companiesMap.get(row.companyId);
    if (existing) {
      existing.holdings.push(row);
      existing.totalShares += row.numShares ?? 0;
      // Ownership/voting are shareholder-level (not per-class), pick first non-null
      if (!existing.ownershipPct && row.ownershipPct) existing.ownershipPct = row.ownershipPct;
      if (!existing.votingPowerPct && row.votingPowerPct) existing.votingPowerPct = row.votingPowerPct;
    } else {
      companiesMap.set(row.companyId, {
        id: row.companyId,
        name: row.companyName,
        orgNumber: row.companyOrgNumber,
        holdings: [row],
        totalShares: row.numShares ?? 0,
        ownershipPct: row.ownershipPct,
        votingPowerPct: row.votingPowerPct,
      });
    }
  }

  return {
    ...shareholder[0],
    aliases,
    contacts,
    companies: Array.from(companiesMap.values()),
  };
}

function formatPct(pct: string | null | undefined): string {
  if (pct == null) return "—";
  const n = parseFloat(pct);
  if (isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

export default async function ShareholderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getShareholderDetail(id);

  if (!data) notFound();

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <div>
        <Link
          href="/shareholders"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
        >
          <ArrowLeft className="size-3" />
          Back to Shareholders
        </Link>
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-lg bg-navy/5">
            {data.entityType === "company" ? (
              <Building2 className="size-6 text-navy" />
            ) : (
              <User className="size-6 text-navy" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-navy">
              {data.canonicalName}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary">
                {data.entityType === "company" ? "Company" : "Person"}
              </Badge>
              {data.orgNumber && (
                <span className="text-sm text-muted-foreground">
                  Org. {data.orgNumber}
                </span>
              )}
              {data.country && (
                <span className="text-sm text-muted-foreground">
                  {data.country}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Companies
            </p>
            <p className="mt-1 text-xl font-semibold text-navy">
              {data.companies.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Aliases
            </p>
            <p className="mt-1 text-xl font-semibold text-navy">
              {data.aliases.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Contacts
            </p>
            <p className="mt-1 text-xl font-semibold text-navy">
              {data.contacts.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Holdings by company */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Holdings by Company</CardTitle>
          <CardDescription>
            Shares held across {data.companies.length} companies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.companies.map((comp) => (
            <div
              key={comp.id}
              className="rounded-lg border border-cream bg-beige-light p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <Link
                  href={`/companies/${comp.id}`}
                  className="font-medium text-navy hover:underline"
                >
                  {comp.name}
                </Link>
                <div className="flex items-center gap-4">
                  {comp.ownershipPct && (
                    <span className="text-sm text-muted-foreground">
                      Ownership: <span className="font-medium text-navy">{formatPct(comp.ownershipPct)}</span>
                    </span>
                  )}
                  {comp.votingPowerPct && (
                    <span className="text-sm text-muted-foreground">
                      Voting: <span className="font-medium text-navy">{formatPct(comp.votingPowerPct)}</span>
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {comp.orgNumber}
                  </span>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Share Class</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead>Entry Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comp.holdings.map((h) => (
                    <TableRow key={h.holdingId}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {h.shareClassName || "Common"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {(h.numShares ?? 0).toLocaleString(APP_LOCALE)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {h.entryDate || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Aliases */}
      {data.aliases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Known Aliases</CardTitle>
            <CardDescription>
              Name variants found across different shareholder registers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name Variant</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Source Company</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.aliases.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.nameVariant}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.email || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.sourceCompanyName || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Contacts */}
      {data.contacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.contacts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-4 rounded-md border border-cream p-3"
                >
                  {c.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="size-3 text-muted-foreground" />
                      {c.email}
                    </div>
                  )}
                  {c.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="size-3 text-muted-foreground" />
                      {c.phone}
                    </div>
                  )}
                  {c.address && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="size-3 text-muted-foreground" />
                      {c.address}
                    </div>
                  )}
                  {c.isPrimary && (
                    <Badge variant="secondary" className="text-xs">
                      Primary
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
