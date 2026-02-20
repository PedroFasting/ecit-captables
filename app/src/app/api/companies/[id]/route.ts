import { db } from "@/db";
import {
  companies,
  shareClasses,
  holdings,
  shareholders,
  importBatches,
  shareholderAliases,
  companyDeletions,
  snapshots,
  transactions,
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Parse reason from request body
    let reason = "";
    try {
      const text = await request.text();
      if (text) {
        const body = JSON.parse(text);
        reason = body.reason?.trim() ?? "";
      }
    } catch {
      // no body or invalid JSON
    }

    if (!reason) {
      return NextResponse.json(
        { error: "Grunn for sletting er påkrevd (reason)" },
        { status: 400 }
      );
    }

    // Fetch company before deletion
    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (company.length === 0) {
      return NextResponse.json({ error: "Selskapet finnes ikke" }, { status: 404 });
    }

    const comp = company[0];

    // Gather stats for the audit log
    const [shareholderCount] = await db
      .select({ count: sql<number>`count(distinct ${holdings.shareholderId})` })
      .from(holdings)
      .where(eq(holdings.companyId, id));

    const [snapshotCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(snapshots)
      .where(eq(snapshots.companyId, id));

    const [transactionCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.companyId, id));

    // Log the deletion BEFORE deleting (so we have a record)
    await db.insert(companyDeletions).values({
      companyName: comp.name,
      orgNumber: comp.orgNumber,
      reason,
      metadata: {
        shareCapital: comp.shareCapital,
        totalShares: comp.totalShares,
        totalVotes: comp.totalVotes,
        nominalValue: comp.nominalValue,
        shareholderCount: shareholderCount?.count ?? 0,
        snapshotCount: snapshotCount?.count ?? 0,
        transactionCount: transactionCount?.count ?? 0,
        deletedCompanyId: id,
      },
    });

    // Clear FK references that don't cascade
    await db
      .update(importBatches)
      .set({ companyId: null })
      .where(eq(importBatches.companyId, id));

    await db
      .update(shareholderAliases)
      .set({ sourceCompanyId: null })
      .where(eq(shareholderAliases.sourceCompanyId, id));

    // Delete company (cascades to share_classes, holdings, snapshots, transactions)
    await db.delete(companies).where(eq(companies.id, id));

    return NextResponse.json({
      success: true,
      message: `Selskapet "${comp.name}" (${comp.orgNumber}) er slettet`,
      reason,
    });
  } catch (err) {
    console.error("DELETE /api/companies/[id] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Intern serverfeil ved sletting" },
      { status: 500 }
    );
  }
}
