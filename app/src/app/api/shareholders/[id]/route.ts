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
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Get shareholder
  const shareholder = await db
    .select()
    .from(shareholders)
    .where(eq(shareholders.id, id))
    .limit(1);

  if (shareholder.length === 0) {
    return NextResponse.json(
      { error: "Shareholder not found" },
      { status: 404 }
    );
  }

  // Get aliases
  const aliases = await db
    .select({
      id: shareholderAliases.id,
      nameVariant: shareholderAliases.nameVariant,
      email: shareholderAliases.email,
      sourceCompanyId: shareholderAliases.sourceCompanyId,
      sourceCompanyName: companies.name,
    })
    .from(shareholderAliases)
    .leftJoin(
      companies,
      eq(shareholderAliases.sourceCompanyId, companies.id)
    )
    .where(eq(shareholderAliases.shareholderId, id));

  // Get contacts
  const contacts = await db
    .select()
    .from(shareholderContacts)
    .where(eq(shareholderContacts.shareholderId, id));

  // Get holdings with company and share class info
  const holdingRows = await db
    .select({
      holdingId: holdings.id,
      companyId: companies.id,
      companyName: companies.name,
      companyOrgNumber: companies.orgNumber,
      shareClassId: shareClasses.id,
      shareClassName: shareClasses.name,
      numShares: holdings.numShares,
      ownershipPct: holdings.ownershipPct,
      votingPowerPct: holdings.votingPowerPct,
      totalCostPrice: holdings.totalCostPrice,
      entryDate: holdings.entryDate,
      shareNumbers: holdings.shareNumbers,
      isPledged: holdings.isPledged,
      pledgeDetails: holdings.pledgeDetails,
    })
    .from(holdings)
    .innerJoin(companies, eq(holdings.companyId, companies.id))
    .leftJoin(shareClasses, eq(holdings.shareClassId, shareClasses.id))
    .where(eq(holdings.shareholderId, id))
    .orderBy(companies.name);

  // Group holdings by company
  const companiesMap = new Map<
    string,
    {
      id: string;
      name: string;
      orgNumber: string;
      holdings: typeof holdingRows;
    }
  >();

  for (const row of holdingRows) {
    const existing = companiesMap.get(row.companyId);
    if (existing) {
      existing.holdings.push(row);
    } else {
      companiesMap.set(row.companyId, {
        id: row.companyId,
        name: row.companyName,
        orgNumber: row.companyOrgNumber,
        holdings: [row],
      });
    }
  }

  return NextResponse.json({
    ...shareholder[0],
    aliases,
    contacts,
    companies: Array.from(companiesMap.values()),
  });
}
