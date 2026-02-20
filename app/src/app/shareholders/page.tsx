import type { Metadata } from "next";
import { db } from "@/db";
import { shareholders, holdings } from "@/db/schema";
import { eq, sql, ilike, or, and } from "drizzle-orm";
import Link from "next/link";
import { Building2, User, SearchX } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShareholderSearch } from "./search";
import { APP_LOCALE } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shareholders - ECIT Cap Tables",
};

async function getShareholders(search?: string, type?: string) {
  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(shareholders.canonicalName, `%${search}%`),
        ilike(shareholders.orgNumber, `%${search}%`)
      )!
    );
  }
  if (type === "company" || type === "person") {
    conditions.push(eq(shareholders.entityType, type));
  }

  const rows = await db
    .select({
      id: shareholders.id,
      canonicalName: shareholders.canonicalName,
      orgNumber: shareholders.orgNumber,
      entityType: shareholders.entityType,
      country: shareholders.country,
      companiesCount: sql<number>`count(distinct ${holdings.companyId})`,
      totalHoldings: sql<number>`count(${holdings.id})`,
      totalShares: sql<number>`coalesce(sum(${holdings.numShares}), 0)`,
    })
    .from(shareholders)
    .leftJoin(holdings, eq(holdings.shareholderId, shareholders.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(shareholders.id)
    .orderBy(sql`coalesce(sum(${holdings.numShares}), 0) desc`);

  return rows;
}

export default async function ShareholdersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string }>;
}) {
  const { search, type } = await searchParams;
  const rows = await getShareholders(search, type);

  const companyCount = rows.filter((r) => r.entityType === "company").length;
  const personCount = rows.filter((r) => r.entityType === "person").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          Shareholders
        </h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} shareholders ({companyCount} companies, {personCount} persons)
        </p>
      </div>

      <ShareholderSearch defaultSearch={search} defaultType={type} />

      <div className="grid gap-2">
        {rows.length === 0 && (search || type) ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <SearchX className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-navy">No shareholders found</p>
              <p className="text-xs text-muted-foreground">
                No results matching your filters. Try a different search term or filter.
              </p>
            </CardContent>
          </Card>
        ) : (
          rows.map((sh) => (
          <Link key={sh.id} href={`/shareholders/${sh.id}`}>
            <Card className="transition-colors hover:border-ecit-blue/30">
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-md bg-navy/5">
                    {sh.entityType === "company" ? (
                      <Building2 className="size-4 text-navy" />
                    ) : (
                      <User className="size-4 text-navy" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-navy">
                      {sh.canonicalName}
                    </p>
                    <div className="flex items-center gap-2">
                      {sh.orgNumber && (
                        <span className="text-xs text-muted-foreground">
                          {sh.orgNumber}
                        </span>
                      )}
                      {sh.country && (
                        <span className="text-xs text-muted-foreground">
                          {sh.country}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant="secondary" className="text-xs">
                    {sh.entityType === "company" ? "Company" : "Person"}
                  </Badge>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Shares
                    </p>
                    <p className="text-base font-semibold text-navy">
                      {Number(sh.totalShares).toLocaleString(APP_LOCALE)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Companies
                    </p>
                    <p className="text-base font-semibold text-navy">
                      {sh.companiesCount}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Holdings
                    </p>
                    <p className="text-base font-semibold text-navy">
                      {sh.totalHoldings}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          ))
        )}
      </div>
    </div>
  );
}
