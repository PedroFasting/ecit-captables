/**
 * Migration script: Create initial snapshots and founding transactions
 * for all existing companies/holdings data.
 *
 * This is a one-time migration to bootstrap the history tracking system
 * for data that was imported before snapshots/transactions existed.
 *
 * What it does:
 *  1. Sets effective_date on import_batches that don't have one (from imported_at)
 *  2. Creates a snapshot for each company with its current state
 *  3. Creates import_diff transactions for every existing holding
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/migrate-initial-snapshots.ts
 *
 * Safe to re-run: checks for existing snapshots/transactions first.
 */
import "dotenv/config";
import { db } from "../src/db";
import {
  companies,
  shareClasses,
  shareholders,
  holdings,
  importBatches,
  snapshots,
  transactions,
} from "../src/db/schema";
import { eq, isNull, sql } from "drizzle-orm";

async function main() {
  console.log("=== Migrate: Initial Snapshots & Transactions ===\n");

  // Check if migration has already been run
  const existingSnapshots = await db
    .select({ count: sql<number>`count(*)` })
    .from(snapshots);
  const existingTxns = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions);

  if (Number(existingSnapshots[0].count) > 0 || Number(existingTxns[0].count) > 0) {
    console.log(
      `Found ${existingSnapshots[0].count} existing snapshots and ${existingTxns[0].count} existing transactions.`
    );
    console.log("Migration appears to have already been run. Aborting.");
    console.log("To re-run, manually delete snapshots and transactions first.");
    process.exit(0);
  }

  // Step 1: Set effective_date on import_batches that don't have one
  console.log("Step 1: Setting effective_date on import_batches...");
  const updatedBatches = await db
    .update(importBatches)
    .set({
      effectiveDate: sql`imported_at::date`,
    })
    .where(isNull(importBatches.effectiveDate))
    .returning({ id: importBatches.id });
  console.log(`  Updated ${updatedBatches.length} import batches.\n`);

  // Step 2 & 3: For each company, create snapshot + transactions
  const allCompanies = await db
    .select({
      id: companies.id,
      name: companies.name,
      orgNumber: companies.orgNumber,
      shareCapital: companies.shareCapital,
      totalShares: companies.totalShares,
      totalVotes: companies.totalVotes,
      nominalValue: companies.nominalValue,
    })
    .from(companies)
    .orderBy(companies.name);

  console.log(`Step 2-3: Processing ${allCompanies.length} companies...\n`);

  let totalSnapshots = 0;
  let totalTransactions = 0;

  for (const company of allCompanies) {
    // Get import batch for this company (for linking)
    const [batch] = await db
      .select({
        id: importBatches.id,
        effectiveDate: importBatches.effectiveDate,
        importedAt: importBatches.importedAt,
      })
      .from(importBatches)
      .where(eq(importBatches.companyId, company.id))
      .limit(1);

    // Effective date: use batch effective_date, fall back to imported_at, fall back to today
    const effectiveDate = batch?.effectiveDate
      ?? (batch?.importedAt ? batch.importedAt.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);

    // Get share classes for this company
    const classes = await db
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
      .where(eq(shareClasses.companyId, company.id));

    // Get holdings with denormalized shareholder + share class names
    const holdingRows = await db
      .select({
        id: holdings.id,
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
      .where(eq(holdings.companyId, company.id));

    if (holdingRows.length === 0) {
      console.log(`  ${company.name}: No holdings, skipping.`);
      continue;
    }

    // Build snapshot data (same shape as captureSnapshotData)
    const snapshotData = {
      company: {
        shareCapital: company.shareCapital,
        totalShares: company.totalShares,
        totalVotes: company.totalVotes,
        nominalValue: company.nominalValue,
      },
      shareClasses: classes,
      holdings: holdingRows.map((h) => ({
        shareholderId: h.shareholderId,
        shareholderName: h.shareholderName,
        shareholderOrgNumber: h.shareholderOrgNumber,
        shareClassId: h.shareClassId,
        shareClassName: h.shareClassName,
        numShares: h.numShares,
        ownershipPct: h.ownershipPct,
        votingPowerPct: h.votingPowerPct,
        totalCostPrice: h.totalCostPrice,
        entryDate: h.entryDate,
        shareNumbers: h.shareNumbers,
      })),
    };

    // Create snapshot
    const [snap] = await db
      .insert(snapshots)
      .values({
        companyId: company.id,
        importBatchId: batch?.id ?? null,
        snapshotData,
        effectiveDate,
      })
      .returning({ id: snapshots.id });

    totalSnapshots++;

    // Create import_diff transactions for each holding
    const txnValues = holdingRows.map((h) => ({
      companyId: company.id,
      type: "import_diff" as const,
      effectiveDate,
      description: `Initiell import: ${h.shareholderName} — ${h.numShares ?? 0} aksjer (${h.shareClassName ?? "Default"})`,
      toShareholderId: h.shareholderId,
      shareClassId: h.shareClassId,
      numShares: h.numShares ?? 0,
      sharesBefore: 0,
      sharesAfter: h.numShares ?? 0,
      source: "import",
      importBatchId: batch?.id ?? null,
      metadata: { migrationScript: "migrate-initial-snapshots", snapshotId: snap.id },
    }));

    if (txnValues.length > 0) {
      await db.insert(transactions).values(txnValues);
      totalTransactions += txnValues.length;
    }

    console.log(
      `  ${company.name}: snapshot created, ${holdingRows.length} transactions logged`
    );
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`  Snapshots created: ${totalSnapshots}`);
  console.log(`  Transactions created: ${totalTransactions}`);
  console.log(`  Import batches updated: ${updatedBatches.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
