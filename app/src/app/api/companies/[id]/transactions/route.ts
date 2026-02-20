import { db } from "@/db";
import { transactions, shareholders, shareClasses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/companies/:id/transactions
 * List transactions for a company, newest first.
 * Supports ?limit=N (default 50) and ?offset=N (default 0).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const url = new URL(_request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    const rows = await db
      .select({
        id: transactions.id,
        type: transactions.type,
        effectiveDate: transactions.effectiveDate,
        description: transactions.description,
        fromShareholderId: transactions.fromShareholderId,
        fromShareholderName: shareholders.canonicalName,
        toShareholderId: transactions.toShareholderId,
        shareClassId: transactions.shareClassId,
        shareClassName: shareClasses.name,
        numShares: transactions.numShares,
        pricePerShare: transactions.pricePerShare,
        totalAmount: transactions.totalAmount,
        sharesBefore: transactions.sharesBefore,
        sharesAfter: transactions.sharesAfter,
        source: transactions.source,
        importBatchId: transactions.importBatchId,
        documentReference: transactions.documentReference,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .leftJoin(shareholders, eq(transactions.toShareholderId, shareholders.id))
      .leftJoin(shareClasses, eq(transactions.shareClassId, shareClasses.id))
      .where(eq(transactions.companyId, companyId))
      .orderBy(desc(transactions.effectiveDate), desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);

    // Also get "from" shareholder names in a second pass for exits/transfers
    const fromIds = [...new Set(rows.filter(r => r.fromShareholderId).map(r => r.fromShareholderId!))];
    const fromNames = new Map<string, string>();
    if (fromIds.length > 0) {
      const fromShareholders = await db
        .select({ id: shareholders.id, name: shareholders.canonicalName })
        .from(shareholders)
        .where(
          fromIds.length === 1
            ? eq(shareholders.id, fromIds[0])
            : eq(shareholders.id, fromIds[0]) // fallback — small set, iterate
        );

      // For multiple from shareholders, query individually (small set)
      for (const fid of fromIds) {
        const [sh] = await db
          .select({ id: shareholders.id, name: shareholders.canonicalName })
          .from(shareholders)
          .where(eq(shareholders.id, fid))
          .limit(1);
        if (sh) fromNames.set(sh.id, sh.name);
      }
    }

    const result = rows.map(r => ({
      ...r,
      fromShareholderName: r.fromShareholderId ? (fromNames.get(r.fromShareholderId) ?? null) : null,
    }));

    return NextResponse.json({ transactions: result, total: result.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Transactions error:", message);
    return NextResponse.json(
      { error: `Failed to fetch transactions: ${message}` },
      { status: 500 }
    );
  }
}
