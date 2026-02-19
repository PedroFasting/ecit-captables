import { db } from "@/db";
import {
  companies,
  shareholders,
  holdings,
  importBatches,
} from "@/db/schema";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Dashboard statistics endpoint.
 */
export async function GET() {
  const [companiesCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies);

  const [shareholdersCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(shareholders);

  const [holdingsCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(holdings);

  const entityBreakdown = await db
    .select({
      entityType: shareholders.entityType,
      count: sql<number>`count(*)`,
    })
    .from(shareholders)
    .groupBy(shareholders.entityType);

  // Cross-owners: shareholders in 2+ companies
  const [crossOwners] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(
      sql`(
        SELECT ${holdings.shareholderId}
        FROM ${holdings}
        GROUP BY ${holdings.shareholderId}
        HAVING count(distinct ${holdings.companyId}) >= 2
      ) sub`
    );

  // Total share capital across all companies
  const [totalCapital] = await db
    .select({
      total: sql<string>`coalesce(sum(${companies.shareCapital}::numeric), 0)`,
    })
    .from(companies);

  // Last import
  const lastImport = await db
    .select({
      id: importBatches.id,
      importedAt: importBatches.importedAt,
      sourceFile: importBatches.sourceFile,
      recordsImported: importBatches.recordsImported,
      conflictsFound: importBatches.conflictsFound,
    })
    .from(importBatches)
    .orderBy(sql`${importBatches.importedAt} desc`)
    .limit(1);

  // Top shareholders by number of companies they own in
  const topShareholders = await db
    .select({
      id: shareholders.id,
      canonicalName: shareholders.canonicalName,
      orgNumber: shareholders.orgNumber,
      entityType: shareholders.entityType,
      companiesCount: sql<number>`count(distinct ${holdings.companyId})`,
    })
    .from(shareholders)
    .innerJoin(holdings, sql`${holdings.shareholderId} = ${shareholders.id}`)
    .groupBy(shareholders.id)
    .orderBy(sql`count(distinct ${holdings.companyId}) desc`)
    .limit(10);

  return NextResponse.json({
    companies: companiesCount.count,
    shareholders: shareholdersCount.count,
    holdings: holdingsCount.count,
    entityBreakdown: Object.fromEntries(
      entityBreakdown.map((e) => [e.entityType, e.count])
    ),
    crossOwners: crossOwners.count,
    totalShareCapital: totalCapital.total,
    lastImport: lastImport[0] ?? null,
    topShareholders,
  });
}
