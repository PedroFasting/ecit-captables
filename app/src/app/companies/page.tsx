import type { Metadata } from "next";
import { db } from "@/db";
import { companies, shareClasses, holdings, shareholders } from "@/db/schema";
import { sql } from "drizzle-orm";
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
  // Compute hierarchy depth using a recursive CTE on the ownership graph.
  // An ownership edge exists when a shareholder's org_number matches a company's org_number,
  // meaning that shareholder IS that parent company.
  const searchFilter = search
    ? sql`AND (c.name ILIKE ${"%" + search + "%"} OR c.org_number ILIKE ${"%" + search + "%"})`
    : sql``;

  const rows = await db.execute<{
    id: string;
    name: string;
    org_number: string;
    share_capital: string | null;
    total_shares: number | null;
    share_class_count: number;
    shareholder_count: number;
    hierarchy_depth: number;
  }>(sql`
    WITH RECURSIVE ownership_edges AS (
      SELECT DISTINCT
        parent_co.id AS parent_id,
        h.company_id AS child_id
      FROM ${holdings} h
      INNER JOIN ${shareholders} s ON s.id = h.shareholder_id
      INNER JOIN ${companies} parent_co ON parent_co.org_number = s.org_number
      WHERE parent_co.id != h.company_id
    ),
    roots AS (
      SELECT c.id, 0 AS depth
      FROM ${companies} c
      WHERE c.id NOT IN (SELECT child_id FROM ownership_edges)
    ),
    hierarchy AS (
      SELECT id, depth FROM roots
      UNION ALL
      SELECT e.child_id, h.depth + 1
      FROM ownership_edges e
      INNER JOIN hierarchy h ON h.id = e.parent_id
    ),
    depths AS (
      SELECT id, MIN(depth) AS depth FROM hierarchy GROUP BY id
    )
    SELECT
      c.id,
      c.name,
      c.org_number,
      c.share_capital,
      c.total_shares,
      (SELECT count(*) FROM ${shareClasses} sc WHERE sc.company_id = c.id)::int AS share_class_count,
      (SELECT count(DISTINCT h2.shareholder_id) FROM ${holdings} h2 WHERE h2.company_id = c.id)::int AS shareholder_count,
      COALESCE(d.depth, 99) AS hierarchy_depth
    FROM ${companies} c
    LEFT JOIN depths d ON d.id = c.id
    WHERE 1=1 ${searchFilter}
    ORDER BY COALESCE(d.depth, 99), c.name
  `);

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
                      Org. {company.org_number}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Shareholders
                    </p>
                    <p className="text-lg font-semibold text-navy">
                      {company.shareholder_count}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Share Classes
                    </p>
                    <p className="text-lg font-semibold text-navy">
                      {company.share_class_count}
                    </p>
                  </div>
                  {company.total_shares && (
                    <div className="text-right">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Total Shares
                      </p>
                      <p className="text-lg font-semibold text-navy">
                        {Number(company.total_shares).toLocaleString(APP_LOCALE)}
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
