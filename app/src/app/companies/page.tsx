import type { Metadata } from "next";
import { db } from "@/db";
import { companies, shareClasses, holdings } from "@/db/schema";
import { ilike, sql } from "drizzle-orm";
import Link from "next/link";
import { Building2, SearchX } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Companies - ECIT Cap Tables",
};
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CompanySearch } from "./search";
import { APP_LOCALE } from "@/lib/utils";

async function getCompanies(search?: string) {
  const conditions = [];
  if (search) {
    conditions.push(
      sql`(${ilike(companies.name, `%${search}%`)} OR ${ilike(companies.orgNumber, `%${search}%`)})`
    );
  }

  // Fix: use subqueries to avoid JOIN multiplication
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      orgNumber: companies.orgNumber,
      shareCapital: companies.shareCapital,
      totalShares: companies.totalShares,
      shareClassCount: sql<number>`(
        SELECT count(*) FROM ${shareClasses}
        WHERE ${shareClasses.companyId} = ${companies.id}
      )`,
      shareholderCount: sql<number>`(
        SELECT count(DISTINCT ${holdings.shareholderId}) FROM ${holdings}
        WHERE ${holdings.companyId} = ${companies.id}
      )`,
    })
    .from(companies)
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .orderBy(companies.name);

  return rows;
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  const rows = await getCompanies(search);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy">
            Companies
          </h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} companies imported from shareholder registers
          </p>
        </div>
      </div>

      <CompanySearch defaultValue={search} />

      <div className="grid gap-3">
        {rows.length === 0 && search ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <SearchX className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-navy">No companies found</p>
              <p className="text-xs text-muted-foreground">
                No results for &ldquo;{search}&rdquo;. Try a different search term.
              </p>
            </CardContent>
          </Card>
        ) : (
          rows.map((company) => (
          <Link key={company.id} href={`/companies/${company.id}`}>
            <Card className="transition-colors hover:border-ecit-blue/30">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="flex size-10 items-center justify-center rounded-md bg-navy/5">
                    <Building2 className="size-5 text-navy" />
                  </div>
                  <div>
                    <p className="font-medium text-navy">{company.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Org. {company.orgNumber}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Shareholders
                    </p>
                    <p className="text-lg font-semibold text-navy">
                      {company.shareholderCount}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Share Classes
                    </p>
                    <p className="text-lg font-semibold text-navy">
                      {company.shareClassCount}
                    </p>
                  </div>
                  {company.totalShares && (
                    <div className="text-right">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Total Shares
                      </p>
                      <p className="text-lg font-semibold text-navy">
                        {Number(company.totalShares).toLocaleString(APP_LOCALE)}
                      </p>
                    </div>
                  )}
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
