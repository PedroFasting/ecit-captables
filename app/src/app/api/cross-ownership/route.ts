import { db } from "@/db";
import {
  shareholders,
  holdings,
  companies,
  shareClasses,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cross-ownership endpoint.
 *
 * Returns shareholders that own shares in 2+ companies,
 * grouped by shareholder with all their holdings.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const minCompanies = parseInt(searchParams.get("min") ?? "2", 10);

  // Find shareholders with holdings in multiple companies
  const crossOwners = await db
    .select({
      id: shareholders.id,
      canonicalName: shareholders.canonicalName,
      orgNumber: shareholders.orgNumber,
      entityType: shareholders.entityType,
      country: shareholders.country,
      companiesCount: sql<number>`count(distinct ${holdings.companyId})`,
    })
    .from(shareholders)
    .innerJoin(holdings, eq(holdings.shareholderId, shareholders.id))
    .groupBy(shareholders.id)
    .having(sql`count(distinct ${holdings.companyId}) >= ${minCompanies}`)
    .orderBy(sql`count(distinct ${holdings.companyId}) desc`, shareholders.canonicalName);

  // For each cross-owner, fetch their holdings with company + class details
  const result = await Promise.all(
    crossOwners.map(async (owner) => {
      const ownerHoldings = await db
        .select({
          companyId: companies.id,
          companyName: companies.name,
          companyOrgNumber: companies.orgNumber,
          shareClassName: shareClasses.name,
          numShares: holdings.numShares,
          ownershipPct: holdings.ownershipPct,
          votingPowerPct: holdings.votingPowerPct,
        })
        .from(holdings)
        .innerJoin(companies, eq(holdings.companyId, companies.id))
        .leftJoin(shareClasses, eq(holdings.shareClassId, shareClasses.id))
        .where(eq(holdings.shareholderId, owner.id))
        .orderBy(companies.name);

      return {
        ...owner,
        holdings: ownerHoldings,
      };
    })
  );

  return NextResponse.json(result);
}
