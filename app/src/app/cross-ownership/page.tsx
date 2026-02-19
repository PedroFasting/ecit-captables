import type { Metadata } from "next";
import { db } from "@/db";
import {
  shareholders,
  holdings,
  companies,
  shareClasses,
} from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import Link from "next/link";
import { GitFork, Building2, User } from "lucide-react";
import { APP_LOCALE } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cross-Ownership | ECIT Cap Tables",
  description: "Shareholders with holdings in multiple companies",
};
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

async function getCrossOwnership() {
  const crossOwners = await db
    .select({
      id: shareholders.id,
      canonicalName: shareholders.canonicalName,
      orgNumber: shareholders.orgNumber,
      entityType: shareholders.entityType,
      companiesCount: sql<number>`count(distinct ${holdings.companyId})`,
    })
    .from(shareholders)
    .innerJoin(holdings, eq(holdings.shareholderId, shareholders.id))
    .groupBy(shareholders.id)
    .having(sql`count(distinct ${holdings.companyId}) >= 2`)
    .orderBy(
      sql`count(distinct ${holdings.companyId}) desc`,
      shareholders.canonicalName
    );

  if (crossOwners.length === 0) return [];

  // Batch query: fetch all holdings for all cross-owners at once
  const allHoldings = await db
    .select({
      shareholderId: holdings.shareholderId,
      companyId: companies.id,
      companyName: companies.name,
      shareClassName: shareClasses.name,
      numShares: holdings.numShares,
      ownershipPct: holdings.ownershipPct,
    })
    .from(holdings)
    .innerJoin(companies, eq(holdings.companyId, companies.id))
    .leftJoin(shareClasses, eq(holdings.shareClassId, shareClasses.id))
    .where(
      inArray(
        holdings.shareholderId,
        crossOwners.map((o) => o.id)
      )
    )
    .orderBy(companies.name);

  // Group holdings by shareholder ID
  const holdingsByOwner = new Map<string, typeof allHoldings>();
  for (const h of allHoldings) {
    const existing = holdingsByOwner.get(h.shareholderId);
    if (existing) {
      existing.push(h);
    } else {
      holdingsByOwner.set(h.shareholderId, [h]);
    }
  }

  return crossOwners.map((owner) => ({
    ...owner,
    holdings: holdingsByOwner.get(owner.id) ?? [],
  }));
}

function formatPct(pct: string | null): string {
  if (!pct) return "—";
  const n = parseFloat(pct);
  if (isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

export default async function CrossOwnershipPage() {
  const data = await getCrossOwnership();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          Cross-Ownership
        </h1>
        <p className="text-sm text-muted-foreground">
          {data.length} shareholders with holdings in 2 or more companies
        </p>
      </div>

      <div className="grid gap-4">
        {data.map((owner) => (
          <Card key={owner.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-md bg-navy/5">
                    {owner.entityType === "company" ? (
                      <Building2 className="size-4 text-navy" />
                    ) : (
                      <User className="size-4 text-navy" />
                    )}
                  </div>
                  <div>
                    <Link
                      href={`/shareholders/${owner.id}`}
                      className="font-medium text-navy hover:underline"
                    >
                      {owner.canonicalName}
                    </Link>
                    {owner.orgNumber && (
                      <p className="text-xs text-muted-foreground">
                        {owner.orgNumber}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {owner.entityType === "company" ? "Company" : "Person"}
                  </Badge>
                  <Badge className="bg-navy text-white">
                    {owner.companiesCount} companies
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {/* Group holdings by company */}
                {(() => {
                  const byCompany = new Map<
                    string,
                    {
                      id: string;
                      name: string;
                      holdings: typeof owner.holdings;
                    }
                  >();
                  for (const h of owner.holdings) {
                    const existing = byCompany.get(h.companyId);
                    if (existing) {
                      existing.holdings.push(h);
                    } else {
                      byCompany.set(h.companyId, {
                        id: h.companyId,
                        name: h.companyName,
                        holdings: [h],
                      });
                    }
                  }
                  return Array.from(byCompany.values()).map((comp) => {
                    // Ownership % is shareholder-level, pick first non-null
                    const ownershipPct = comp.holdings.find(
                      (h) => h.ownershipPct
                    )?.ownershipPct;
                    return (
                      <Link
                        key={comp.id}
                        href={`/companies/${comp.id}`}
                        className="rounded-md border border-cream bg-beige-light p-3 transition-colors hover:border-ecit-blue/30"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-navy">
                            {comp.name}
                          </p>
                          {ownershipPct && (
                            <span className="text-xs font-medium text-navy">
                              {formatPct(ownershipPct)}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {comp.holdings.map((h, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between text-xs text-muted-foreground"
                            >
                              <span>{h.shareClassName || "Common"}</span>
                              <span>
                                {(h.numShares ?? 0).toLocaleString(APP_LOCALE)} shares
                              </span>
                            </div>
                          ))}
                        </div>
                      </Link>
                    );
                  });
                })()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
