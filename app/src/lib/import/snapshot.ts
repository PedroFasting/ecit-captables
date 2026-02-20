/**
 * Snapshot creator: captures the current state of a company's
 * share classes and holdings as a JSONB snapshot for historical reference.
 */
import { db } from "@/db";
import {
  companies,
  shareClasses,
  shareholders,
  holdings,
  snapshots,
} from "@/db/schema";
import { eq } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────

/** Transaction-capable database type */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface SnapshotData {
  company: {
    shareCapital: string | null;
    totalShares: number | null;
    totalVotes: number | null;
    nominalValue: string | null;
  };
  shareClasses: SnapshotShareClass[];
  holdings: SnapshotHolding[];
}

export interface SnapshotShareClass {
  id: string;
  name: string;
  totalShares: number | null;
  nominalValue: string | null;
  shareCapital: string | null;
  totalVotes: number | null;
  remarks: string | null;
}

export interface SnapshotHolding {
  shareholderId: string;
  shareholderName: string;
  shareholderOrgNumber: string | null;
  shareClassId: string | null;
  shareClassName: string | null;
  numShares: number | null;
  ownershipPct: string | null;
  votingPowerPct: string | null;
  totalCostPrice: string | null;
  entryDate: string | null;
  shareNumbers: string | null;
}

// ── Snapshot Functions ─────────────────────────────────

/**
 * Capture the current state of a company as a snapshot.
 * Returns the snapshot ID.
 */
export async function createSnapshot(
  tx: Tx,
  companyId: string,
  importBatchId: string | null,
  effectiveDate: string
): Promise<string> {
  const data = await captureSnapshotData(tx, companyId);

  const [row] = await tx
    .insert(snapshots)
    .values({
      companyId,
      importBatchId,
      snapshotData: data,
      effectiveDate,
    })
    .returning({ id: snapshots.id });

  return row.id;
}

/**
 * Read current company state without writing anything.
 * Useful for diff calculations.
 */
export async function captureSnapshotData(
  tx: Tx | typeof db,
  companyId: string
): Promise<SnapshotData> {
  // Get company info
  const [company] = await tx
    .select({
      shareCapital: companies.shareCapital,
      totalShares: companies.totalShares,
      totalVotes: companies.totalVotes,
      nominalValue: companies.nominalValue,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  // Get share classes
  const classes = await tx
    .select({
      id: shareClasses.id,
      name: shareClasses.name,
      totalShares: shareClasses.totalShares,
      nominalValue: shareClasses.nominalValue,
      shareCapital: shareClasses.shareCapital,
      totalVotes: shareClasses.totalVotes,
      remarks: shareClasses.remarks,
    })
    .from(shareClasses)
    .where(eq(shareClasses.companyId, companyId));

  // Get holdings with denormalized shareholder + share class names
  const holdingRows = await tx
    .select({
      shareholderId: holdings.shareholderId,
      shareholderName: shareholders.canonicalName,
      shareholderOrgNumber: shareholders.orgNumber,
      shareClassId: holdings.shareClassId,
      shareClassName: shareClasses.name,
      numShares: holdings.numShares,
      ownershipPct: holdings.ownershipPct,
      votingPowerPct: holdings.votingPowerPct,
      totalCostPrice: holdings.totalCostPrice,
      entryDate: holdings.entryDate,
      shareNumbers: holdings.shareNumbers,
    })
    .from(holdings)
    .innerJoin(shareholders, eq(holdings.shareholderId, shareholders.id))
    .leftJoin(shareClasses, eq(holdings.shareClassId, shareClasses.id))
    .where(eq(holdings.companyId, companyId));

  return {
    company: {
      shareCapital: company.shareCapital,
      totalShares: company.totalShares,
      totalVotes: company.totalVotes,
      nominalValue: company.nominalValue,
    },
    shareClasses: classes,
    holdings: holdingRows,
  };
}
