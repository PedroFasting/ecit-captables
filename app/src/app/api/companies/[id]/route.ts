import { db } from "@/db";
import {
  companies,
  shareClasses,
  holdings,
  shareholders,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Get company
  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);

  if (company.length === 0) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Get share classes
  const classes = await db
    .select()
    .from(shareClasses)
    .where(eq(shareClasses.companyId, id));

  // Get shareholders with their holdings in this company
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
      totalCostPrice: holdings.totalCostPrice,
      entryDate: holdings.entryDate,
      shareNumbers: holdings.shareNumbers,
      isPledged: holdings.isPledged,
    })
    .from(holdings)
    .innerJoin(shareholders, eq(holdings.shareholderId, shareholders.id))
    .leftJoin(shareClasses, eq(holdings.shareClassId, shareClasses.id))
    .where(eq(holdings.companyId, id))
    .orderBy(shareholders.canonicalName);

  // Group holdings by shareholder
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
    }
  >();

  for (const row of holdingRows) {
    const existing = shareholderMap.get(row.shareholderId);
    if (existing) {
      existing.holdings.push(row);
      existing.totalShares += row.numShares ?? 0;
    } else {
      shareholderMap.set(row.shareholderId, {
        id: row.shareholderId,
        name: row.shareholderName,
        orgNumber: row.shareholderOrgNumber,
        entityType: row.entityType,
        country: row.country,
        holdings: [row],
        totalShares: row.numShares ?? 0,
      });
    }
  }

  return NextResponse.json({
    ...company[0],
    shareClasses: classes,
    shareholders: Array.from(shareholderMap.values()).sort(
      (a, b) => b.totalShares - a.totalShares
    ),
  });
}
