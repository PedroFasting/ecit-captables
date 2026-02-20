import { db } from "@/db";
import { snapshots, importBatches } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/companies/:id/snapshots
 * List snapshots for a company, newest first.
 * Returns metadata (not the full JSONB data) unless ?full=true.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const url = new URL(_request.url);
    const includeFull = url.searchParams.get("full") === "true";

    const rows = await db
      .select({
        id: snapshots.id,
        companyId: snapshots.companyId,
        importBatchId: snapshots.importBatchId,
        effectiveDate: snapshots.effectiveDate,
        createdAt: snapshots.createdAt,
        snapshotData: snapshots.snapshotData,
        sourceFile: importBatches.sourceFile,
      })
      .from(snapshots)
      .leftJoin(importBatches, eq(snapshots.importBatchId, importBatches.id))
      .where(eq(snapshots.companyId, companyId))
      .orderBy(desc(snapshots.effectiveDate), desc(snapshots.createdAt));

    const result = rows.map(r => {
      const snapshotData = r.snapshotData as {
        holdings?: unknown[];
        shareClasses?: unknown[];
      } | null;

      const base = {
        id: r.id,
        companyId: r.companyId,
        importBatchId: r.importBatchId,
        effectiveDate: r.effectiveDate,
        createdAt: r.createdAt,
        sourceFile: r.sourceFile,
        holdingsCount: Array.isArray(snapshotData?.holdings) ? snapshotData.holdings.length : 0,
        shareClassCount: Array.isArray(snapshotData?.shareClasses) ? snapshotData.shareClasses.length : 0,
      };

      if (includeFull) {
        return { ...base, snapshotData: r.snapshotData };
      }

      return base;
    });

    return NextResponse.json({ snapshots: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Snapshots error:", message);
    return NextResponse.json(
      { error: `Failed to fetch snapshots: ${message}` },
      { status: 500 }
    );
  }
}
